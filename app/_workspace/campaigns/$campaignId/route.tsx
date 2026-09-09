import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/campaigns/$campaignId")({
	component: Outlet,
});
