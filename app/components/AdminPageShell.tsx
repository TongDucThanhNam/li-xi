"use client";

import { ProgressCircle } from "@heroui/react";
import { Widget } from "@heroui-pro/react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { createPortal } from "react-dom";

type AdminWorkspaceValue = {
	asideHost: HTMLDivElement | null;
	setHasAside: (hasAside: boolean) => void;
};

export const AdminWorkspaceContext = createContext<AdminWorkspaceValue | null>(null);

type AdminBreadcrumb = {
	href?: string;
	label: string;
};

function getBreadcrumbs(pathname: string, title: string, contextLabel?: string): AdminBreadcrumb[] {
	if (pathname === "/onboarding") return [{ label: "Bắt đầu" }];
	if (pathname === "/campaigns") return [{ label: "Chiến dịch" }];
	if (pathname === "/campaigns/new") {
		return [{ href: "/campaigns", label: "Chiến dịch" }, { label: title }];
	}
	if (pathname.startsWith("/campaigns/")) {
		const segments = pathname.split("/").filter(Boolean);
		const campaignHref = segments.length >= 2 ? `/campaigns/${segments[1]}` : undefined;
		const campaignLabel = contextLabel || (segments.length === 2 ? title : "Chiến dịch");
		const items: AdminBreadcrumb[] = [
			{ href: "/campaigns", label: "Chiến dịch" },
			{ href: segments.length > 2 ? campaignHref : undefined, label: campaignLabel },
		];
		if (segments[2] === "games") {
			items.push({
				href: segments.length > 3 ? `${campaignHref}/games` : undefined,
				label: segments.length > 3 ? "Trò chơi" : title,
			});
			if (segments.length > 3) items.push({ label: title });
		} else if (segments.length > 2) {
			items.push({ label: title });
		}
		return items;
	}
	if (pathname === "/analytics") return [{ label: "Phân tích" }];
	if (pathname.startsWith("/settings/")) {
		return [{ href: "/settings/billing", label: "Cài đặt" }, { label: title }];
	}
	if (pathname.startsWith("/operate/")) {
		return [
			{ href: "/campaigns", label: "Chiến dịch" },
			...(contextLabel ? [{ label: contextLabel }] : []),
			{ label: title },
		];
	}
	return [{ label: title }];
}

export function AdminPageShell({ actions, aside, breadcrumbContext, children, description, eyebrow = "Campaign Game Studio", title }: {
	actions?: ReactNode;
	aside?: ReactNode;
	breadcrumbContext?: string;
	children: ReactNode;
	description?: string;
	eyebrow?: string;
	title: string;
}) {
	const { pathname } = useLocation();
	const workspace = useContext(AdminWorkspaceContext);
	const setHasWorkspaceAside = workspace?.setHasAside;
	const breadcrumbs = getBreadcrumbs(pathname, title, breadcrumbContext);
	const hasPageAside = Boolean(aside);

	useEffect(() => {
		document.title = `${title} | Campaign Game Studio`;
	}, [title]);

	useEffect(() => {
		if (!setHasWorkspaceAside || !hasPageAside) return;
		setHasWorkspaceAside(true);
		return () => setHasWorkspaceAside(false);
	}, [hasPageAside, setHasWorkspaceAside]);

	return <div className="admin-page"><div className="admin-page__inner"><header className="admin-page__header"><div className="admin-page__heading"><div className="min-w-0"><nav aria-label="Đường dẫn trang" className="admin-breadcrumbs"><ol>{breadcrumbs.map((item, index) => <li key={`${item.label}-${index}`}>{index > 0 ? <ChevronRight aria-hidden="true" size={14} /> : null}{item.href ? <Link to={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</li>)}</ol></nav><p className="admin-page__eyebrow">{eyebrow}</p><h1 className="admin-page__title">{title}</h1>{description ? <p className="admin-page__description">{description}</p> : null}</div></div>{actions ? <div className="admin-page__actions">{actions}</div> : null}</header><div className="min-w-0">{children}</div>{aside && workspace?.asideHost ? createPortal(<aside aria-label="Ngữ cảnh trang">{aside}</aside>, workspace.asideHost) : null}</div></div>;
}

export function AdminRouteStatus({ contractText, description, icon, status = "Đang tải", statusDetail = "Đang đồng bộ dữ liệu không gian làm việc.", title }: {
	contractText?: string;
	description: string;
	icon?: ReactNode;
	status?: string;
	statusDetail?: string;
	title: string;
}) {
	return <main className="grid min-h-dvh place-items-center bg-background px-6 text-foreground" role="status">{contractText ? <span className="sr-only">{contractText}</span> : null}<Widget className="w-full max-w-md"><Widget.Header>{icon}<Widget.Title>{title}</Widget.Title><Widget.Description>{description}</Widget.Description></Widget.Header><Widget.Content className="items-center gap-4 text-center"><ProgressCircle aria-label={statusDetail} isIndeterminate><ProgressCircle.Track><ProgressCircle.TrackCircle /><ProgressCircle.FillCircle /></ProgressCircle.Track></ProgressCircle><p className="text-sm font-medium">{status}</p><p className="text-xs text-muted">{statusDetail}</p></Widget.Content></Widget></main>;
}
