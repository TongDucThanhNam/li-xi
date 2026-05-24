"use client";

import {
	Avatar,
	Breadcrumbs,
	Button,
	Chip,
	Dropdown,
	Label,
	ProgressCircle,
	Tooltip,
} from "@heroui/react";
import { AppLayout, EmptyState, Navbar, Sidebar, Widget } from "@heroui-pro/react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
	BarChart3,
	ChevronUp,
	CircleDot,
	Gift,
	LogOut,
	type LucideIcon,
	MonitorPlay,
	Settings2,
	Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

type AdminPageShellProps = {
	aside?: ReactNode;
	children: ReactNode;
	description?: string;
	eyebrow?: string;
	hasFloatingActionBar?: boolean;
	ownerUsername?: string;
	title: string;
	onLogout?: () => void | Promise<void>;
	actions?: ReactNode;
};

type AdminRouteStatusProps = {
	contractText?: string;
	description: string;
	icon?: ReactNode;
	status?: string;
	statusDetail?: string;
	title: string;
};

const navItems = [
	{
		description: "Campaign Studio",
		href: "/campaigns",
		label: "Campaigns",
		section: "Workspace",
	},
	{
		description: "Budget and host PIN",
		href: "/setup",
		label: "Setup",
		section: "Workspace",
	},
	{
		description: "Leaderboard and metrics",
		href: "/leaderboard",
		label: "Analytics",
		section: "Workspace",
	},
	{
		description: "Guest station mode",
		section: "Operate",
		...{ href: "/draw", label: "Draw Station" },
	},
];

const navSections = ["Workspace", "Operate"] as const;

const navIcons: Record<string, LucideIcon> = {
	"/campaigns": Gift,
	"/setup": Settings2,
	"/leaderboard": BarChart3,
	"/draw": MonitorPlay,
};

export function AdminPageShell({
	actions,
	aside,
	children,
	description,
	eyebrow = "Li Xi Station",
	hasFloatingActionBar = false,
	ownerUsername,
	title,
	onLogout,
}: AdminPageShellProps) {
	const navigate = useNavigate();
	const location = useLocation();
	const navigateTo = (href: string) => {
		void navigate({ to: href });
	};
	const currentNavItem = navItems.find((item) => location.pathname === item.href);
	const CurrentNavIcon = currentNavItem ? navIcons[currentNavItem.href] : Sparkles;

	const sidebar = (
		<>
			<Sidebar>
				<AdminSidebarContent currentPath={location.pathname} />
				<Sidebar.Footer>
					<SidebarUserMenu ownerUsername={ownerUsername} onLogout={onLogout} />
				</Sidebar.Footer>
				<Sidebar.Rail />
			</Sidebar>
			<Sidebar.Mobile>
				<AdminSidebarContent currentPath={location.pathname} />
				<Sidebar.Footer>
					<SidebarUserMenu ownerUsername={ownerUsername} onLogout={onLogout} />
				</Sidebar.Footer>
			</Sidebar.Mobile>
		</>
	);

	const navbar = (
		<Navbar height="3.5rem" maxWidth="full" size="sm">
			<Navbar.Header>
				<AppLayout.MenuToggle
					aria-label="Open navigation"
					tooltip="Open navigation"
					tooltipProps={{ delay: 300, placement: "bottom", showArrow: true }}
				/>
				<Tooltip delay={300}>
					<Sidebar.Trigger aria-label="Collapse navigation" />
					<Tooltip.Content placement="bottom" showArrow>
						<Tooltip.Arrow />
						Collapse navigation
					</Tooltip.Content>
				</Tooltip>
				<Navbar.Content className="min-w-0">
					<Navbar.Item className="min-w-0">
						<div className="flex min-w-0 items-center gap-3">
							{currentNavItem ? (
								<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-secondary text-accent">
									{(() => {
										const Icon = navIcons[currentNavItem.href];
										return <Icon aria-hidden="true" size={16} strokeWidth={2} />;
									})()}
								</span>
							) : null}
							<span className="min-w-0">
								<Breadcrumbs className="hidden min-w-0 md:flex">
									<Breadcrumbs.Item>Workspace</Breadcrumbs.Item>
									<Breadcrumbs.Item>
										{currentNavItem?.label ?? title}
									</Breadcrumbs.Item>
								</Breadcrumbs>
								<span className="block truncate text-sm font-medium text-foreground md:hidden">
									{title}
								</span>
								<span className="block truncate text-xs text-muted">
									{currentNavItem?.description ?? eyebrow}
								</span>
							</span>
						</div>
					</Navbar.Item>
				</Navbar.Content>
				{currentNavItem ? (
					<Chip className="hidden shrink-0 lg:inline-flex" size="sm" variant="soft">
						{currentNavItem.section}
					</Chip>
				) : null}
				<Navbar.Spacer />
				{actions ? (
					<Navbar.Content className="admin-navbar-actions">{actions}</Navbar.Content>
				) : null}
				{aside ? (
					<AppLayout.AsideTrigger
						aria-label="Toggle workspace details"
						closedTooltip="Show workspace details"
						openTooltip="Hide workspace details"
						tooltipProps={{ delay: 300, placement: "bottom", showArrow: true }}
					/>
				) : null}
			</Navbar.Header>
		</Navbar>
	);

	return (
		<AppLayout
			aside={aside}
			asideToggleShortcut="mod+."
			asideMobile="sheet"
			className="admin-shell"
			navigate={navigateTo}
			navbar={navbar}
			scrollMode="content"
			sidebar={sidebar}
			sidebarCollapsible="icon"
		>
			<div
				className={
					hasFloatingActionBar
						? "admin-page admin-page--with-floating-action"
						: "admin-page"
				}
			>
				<div className="admin-page__inner">
					<header className="admin-page__header">
						<div className="admin-page__heading">
							<span className="admin-page__heading-icon">
								<CurrentNavIcon aria-hidden="true" size={20} strokeWidth={2} />
							</span>
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<p className="admin-page__eyebrow">{eyebrow}</p>
									{currentNavItem ? (
										<Chip size="sm" variant="soft">
											{currentNavItem.section}
										</Chip>
									) : null}
								</div>
								<h1 className="admin-page__title">{title}</h1>
								{description ? (
									<p className="admin-page__description">{description}</p>
								) : null}
							</div>
						</div>
						{actions ? <div className="admin-page__actions">{actions}</div> : null}
					</header>
					{children}
				</div>
			</div>
		</AppLayout>
	);
}

export function AdminRouteStatus({
	contractText,
	description,
	icon,
	status = "Loading",
	statusDetail = "Đang đồng bộ dữ liệu workspace.",
	title,
}: AdminRouteStatusProps) {
	return (
		<main className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
			{contractText ? <span className="sr-only">{contractText}</span> : null}
			<Widget className="w-full max-w-md">
				<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
					<div className="flex min-w-0 items-start gap-3">
						<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-accent">
							<Sparkles aria-hidden="true" size={18} strokeWidth={2} />
						</span>
						<div className="min-w-0">
							<Widget.Title>Li Xi Station</Widget.Title>
							<Widget.Description>Campaign workspace</Widget.Description>
						</div>
					</div>
					<Chip color="accent" variant="soft">
						{status}
					</Chip>
				</Widget.Header>
				<Widget.Content className="gap-4">
					<EmptyState size="sm">
						<EmptyState.Header>
							<EmptyState.Media className="text-accent" variant="icon">
								{icon ?? (
									<CircleDot aria-hidden="true" size={22} strokeWidth={2} />
								)}
							</EmptyState.Media>
							<EmptyState.Title>{title}</EmptyState.Title>
							<EmptyState.Description>{description}</EmptyState.Description>
						</EmptyState.Header>
					</EmptyState>
					<div
						aria-live="polite"
						className="flex items-center gap-3 rounded-xl bg-surface-secondary p-3 text-sm text-muted"
						role="status"
					>
						<ProgressCircle
							aria-label={statusDetail}
							color="accent"
							isIndeterminate
							size="sm"
						>
							<ProgressCircle.Track>
								<ProgressCircle.TrackCircle />
								<ProgressCircle.FillCircle />
							</ProgressCircle.Track>
						</ProgressCircle>
						<span className="min-w-0 leading-5">{statusDetail}</span>
					</div>
				</Widget.Content>
			</Widget>
		</main>
	);
}

function AdminSidebarContent({ currentPath }: { currentPath: string }) {
	return (
		<>
			<Sidebar.Header>
				<div className="admin-sidebar-brand">
					<span className="admin-sidebar-brand__mark">
						<Sparkles aria-hidden="true" size={18} strokeWidth={2} />
					</span>
					<span className="admin-sidebar-brand__copy">
						<span className="block truncate text-base font-semibold text-foreground">
							Li Xi Station
						</span>
						<span className="block truncate text-xs text-muted">
							Campaign operations
						</span>
						<Chip className="mt-1 w-fit" color="accent" size="sm" variant="soft">
							Workspace
						</Chip>
					</span>
				</div>
			</Sidebar.Header>
			<Sidebar.Content>
				{navSections.map((section) => (
					<Sidebar.Group key={section}>
						<Sidebar.GroupLabel>{section}</Sidebar.GroupLabel>
						<Sidebar.Menu showGuideLines={false}>
							{navItems
								.filter((item) => item.section === section)
								.map((item) => {
									const Icon = navIcons[item.href];

									return (
										<Sidebar.MenuItem
											href={item.href}
											isCurrent={currentPath === item.href}
											key={item.href}
											tooltip={item.label}
										>
											<Sidebar.MenuIcon>
												<Icon aria-hidden="true" size={18} strokeWidth={2} />
											</Sidebar.MenuIcon>
											<Sidebar.MenuLabel>{item.label}</Sidebar.MenuLabel>
										</Sidebar.MenuItem>
									);
								})}
						</Sidebar.Menu>
					</Sidebar.Group>
				))}
			</Sidebar.Content>
		</>
	);
}

function SidebarUserMenu({
	ownerUsername,
	onLogout,
}: {
	ownerUsername?: string;
	onLogout?: () => void | Promise<void>;
}) {
	const displayName = ownerUsername ?? "Host";
	const identity = (
		<span className="admin-sidebar-user">
			<Avatar size="sm" variant="soft">
				<Avatar.Fallback>{getInitials(displayName)}</Avatar.Fallback>
			</Avatar>
			<span className="admin-sidebar-user__copy">
				<span className="block truncate text-xs text-muted">Signed in as</span>
				<span className="block truncate text-sm font-medium text-foreground">
					{displayName}
				</span>
			</span>
		</span>
	);

	if (!onLogout) {
		return <div className="min-w-0 px-3 py-2">{identity}</div>;
	}

	return (
		<div className="min-w-0 px-3 py-2">
			<Dropdown>
				<Button
					fullWidth
					aria-label={`Open account menu for ${displayName}`}
					className="admin-sidebar-user-button"
					variant="ghost"
				>
					{identity}
					<ChevronUp
						aria-hidden="true"
						className="admin-sidebar-user__chevron"
						size={16}
						strokeWidth={2}
					/>
				</Button>
				<Dropdown.Popover className="min-w-[220px]" placement="top start">
					<Dropdown.Menu
						onAction={(key) => {
							if (key === "sign-out") {
								void onLogout();
							}
						}}
					>
						<Dropdown.Item id="sign-out" textValue="Sign out" variant="danger">
							<LogOut aria-hidden="true" size={16} strokeWidth={2} />
							<Label>Sign out</Label>
						</Dropdown.Item>
					</Dropdown.Menu>
				</Dropdown.Popover>
			</Dropdown>
		</div>
	);
}

function getInitials(name: string) {
	const parts = name
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	return (parts[0]?.[0] ?? "H").toUpperCase();
}
