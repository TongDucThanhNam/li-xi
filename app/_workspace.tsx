"use client";

import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceLayout } from "./_workspace/-components/WorkspaceLayout";
import {
	WorkspaceNotFound,
	WorkspacePending,
	WorkspaceRouteError,
} from "./_workspace/-components/WorkspaceRouteStates";
import { requireHostRouteAuth } from "@/lib/hostRouteGuard";
import adminCss from "./styles/admin.css?url";

export const Route = createFileRoute("/_workspace")({
	beforeLoad: requireHostRouteAuth,
	errorComponent: WorkspaceRouteError,
	head: () => ({
		links: [{ rel: "stylesheet", href: adminCss }],
		meta: [
			{ title: "Campaign Game Studio" },
			{ name: "description", content: "Không gian vận hành chiến dịch trò chơi marketing." },
		],
	}),
	notFoundComponent: WorkspaceNotFound,
	pendingComponent: WorkspacePending,
	component: WorkspaceLayout,
});
