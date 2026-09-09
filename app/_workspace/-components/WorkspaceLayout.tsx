"use client";

import { Avatar, Button } from "@heroui/react";
import { AppLayout, Navbar, Sheet, Sidebar, useSidebar } from "@heroui-pro/react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { BarChart3, Gift, LogOut, PanelRightOpen, Settings2, Sparkles } from "lucide-react";
import {
	type ReactNode,
	type RefCallback,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { AdminWorkspaceContext } from "@/app/components/AdminPageShell";
import { useHostLogout } from "@/lib/useHostLogout";
import { useOwnerSession } from "@/lib/useOwnerSession";
import { WorkspacePending } from "./WorkspaceRouteStates";

const navigation = [
	{ href: "/campaigns", label: "Chiến dịch", icon: Gift },
	{ href: "/analytics", label: "Phân tích", icon: BarChart3 },
	{ href: "/settings/billing", label: "Cài đặt", icon: Settings2 },
] as const;

function WorkspaceMobileSidebar({ children }: { children: ReactNode }) {
	const { isMobile, isMobileOpen, setMobileOpen, side } = useSidebar();

	if (!isMobile) return null;

	return (
		<Sheet
			isDismissable={false}
			isOpen={isMobileOpen}
			placement={side}
			shouldAutoFocus
			onOpenChange={setMobileOpen}
		>
			<Sheet.Backdrop variant="blur">
				<Sheet.Content className="sidebar__mobile-sheet">
					<Sheet.Dialog
						aria-label="Điều hướng không gian làm việc"
						className="sidebar__mobile-dialog"
					>
						<Sheet.CloseTrigger aria-label="Đóng điều hướng" />
						<div className="sidebar__mobile" data-slot="sidebar-mobile">
							{children}
						</div>
					</Sheet.Dialog>
				</Sheet.Content>
			</Sheet.Backdrop>
		</Sheet>
	);
}

function WorkspaceMobileAside({
	hostRef,
	isOpen,
	onOpenChange,
}: {
	hostRef: RefCallback<HTMLDivElement>;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { isMobile } = useSidebar();

	if (!isMobile) return null;

	return (
		<Sheet
			isDismissable={false}
			isOpen={isOpen}
			placement="right"
			shouldAutoFocus
			onOpenChange={onOpenChange}
		>
			<Sheet.Backdrop variant="blur">
				<Sheet.Content className="w-[min(22rem,94vw)] lg:hidden">
					<Sheet.Dialog aria-label="Ngữ cảnh trang" className="h-full">
						<Sheet.CloseTrigger aria-label="Đóng ngữ cảnh trang" />
						<div className="admin-aside-host min-h-0 flex-1 overflow-y-auto" ref={hostRef} />
					</Sheet.Dialog>
				</Sheet.Content>
			</Sheet.Backdrop>
		</Sheet>
	);
}

export function WorkspaceLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const { isAuthenticated, isLoading } = useConvexAuth();
	const owner = useOwnerSession();
	const logout = useHostLogout();
	const [asideHost, setAsideHost] = useState<HTMLDivElement | null>(null);
	const [hasAside, setHasAside] = useState(false);
	const [asideOpen, setAsideOpen] = useState(false);
	const desktopAsideHostRef = useRef<HTMLDivElement | null>(null);
	const mobileAsideHostRef = useRef<HTMLDivElement | null>(null);
	const setDesktopAsideHost = useCallback<RefCallback<HTMLDivElement>>((node) => {
		desktopAsideHostRef.current = node;
		setAsideHost(mobileAsideHostRef.current ?? node);
	}, []);
	const setMobileAsideHost = useCallback<RefCallback<HTMLDivElement>>((node) => {
		mobileAsideHostRef.current = node;
		setAsideHost(node ?? desktopAsideHostRef.current);
	}, []);
	const workspaceContext = useMemo(() => ({ asideHost, setHasAside }), [asideHost]);
	const current = navigation.find((item) =>
		item.href === "/settings/billing"
			? location.pathname.startsWith("/settings")
			: location.pathname === item.href || location.pathname.startsWith(item.href + "/"),
	);
	const navigateTo = (href: string) => void navigate({ href });

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			void navigate({ to: "/auth", replace: true });
		}
	}, [isAuthenticated, isLoading, navigate]);

	if (isLoading || !isAuthenticated) {
		return <WorkspacePending />;
	}

	const sidebarContent = (includeRail: boolean) => (
		<>
			<Sidebar.Header>
				<div className="admin-sidebar-brand">
					<span className="admin-sidebar-brand__mark">
						<Sparkles aria-hidden="true" size={18} />
					</span>
					<span className="admin-sidebar-brand__copy">
						<span className="block truncate text-base font-semibold text-foreground">
							Campaign Game Studio
						</span>
						<span className="block truncate text-xs text-muted">
							Nền tảng trò chơi marketing
						</span>
					</span>
				</div>
			</Sidebar.Header>
			<Sidebar.Content>
				<Sidebar.Group>
					<Sidebar.GroupLabel>Không gian làm việc</Sidebar.GroupLabel>
					<Sidebar.Menu aria-label="Điều hướng không gian làm việc" showGuideLines={false}>
						{navigation.map((item) => {
							const Icon = item.icon;
							return (
								<Sidebar.MenuItem
									href={item.href}
									isCurrent={current?.href === item.href}
									key={item.href}
									tooltip={item.label}
								>
									<Sidebar.MenuIcon><Icon aria-hidden="true" size={18} /></Sidebar.MenuIcon>
									<Sidebar.MenuLabel>{item.label}</Sidebar.MenuLabel>
								</Sidebar.MenuItem>
							);
						})}
					</Sidebar.Menu>
				</Sidebar.Group>
			</Sidebar.Content>
			<Sidebar.Footer>
				<div className="flex items-center gap-3 px-3 py-2">
					<Avatar size="sm" variant="soft">
						<Avatar.Fallback>{owner?.username?.[0]?.toUpperCase() ?? "H"}</Avatar.Fallback>
					</Avatar>
					<span className="min-w-0 flex-1 truncate text-sm">{owner?.username ?? "Người vận hành"}</span>
					<Button aria-label="Đăng xuất" isIconOnly onPress={() => void logout()} variant="ghost">
						<LogOut aria-hidden="true" size={17} />
					</Button>
				</div>
			</Sidebar.Footer>
			{includeRail ? (
				<Sidebar.Rail
					aria-label="Thu gọn hoặc mở rộng điều hướng"
					title="Thu gọn hoặc mở rộng điều hướng"
				/>
			) : null}
		</>
	);

	return (
		<AppLayout
			aside={hasAside ? <div className="admin-aside-host" ref={setDesktopAsideHost} /> : undefined}
			asideOpen={asideOpen}
			asideToggleShortcut="mod+."
			className="admin-shell"
			navigate={navigateTo}
			onAsideOpenChange={setAsideOpen}
			navbar={
				<Navbar height="3.5rem" maxWidth="full" size="sm">
					<Navbar.Header>
						<AppLayout.MenuToggle aria-label="Mở điều hướng" />
						<Sidebar.Trigger aria-label="Thu gọn điều hướng" />
						<Navbar.Content>
							<Navbar.Item className="text-sm font-medium">
								{current?.label ?? "Không gian làm việc"}
							</Navbar.Item>
						</Navbar.Content>
						{hasAside ? (
							<>
								<AppLayout.AsideTrigger
									aria-label="Mở ngữ cảnh trang"
									className="hidden lg:inline-flex"
								/>
								<Button
									aria-label="Mở ngữ cảnh trang"
									className="lg:hidden"
									isIconOnly
									size="sm"
									variant="ghost"
									onPress={() => setAsideOpen(true)}
								>
									<PanelRightOpen aria-hidden="true" size={16} />
								</Button>
							</>
						) : null}
					</Navbar.Header>
				</Navbar>
			}
			scrollMode="content"
			sidebar={
				<>
					<Sidebar>{sidebarContent(true)}</Sidebar>
					<WorkspaceMobileSidebar>{sidebarContent(false)}</WorkspaceMobileSidebar>
				</>
			}
			sidebarCollapsible="icon"
		>
			<AdminWorkspaceContext.Provider value={workspaceContext}>
				<WorkspaceMobileAside
					hostRef={setMobileAsideHost}
					isOpen={hasAside && asideOpen}
					onOpenChange={setAsideOpen}
				/>
				<Outlet />
			</AdminWorkspaceContext.Provider>
		</AppLayout>
	);
}
