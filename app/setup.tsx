"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { StandaloneAdminRouteError } from "@/app/-auth/StandaloneAdminRouteError";
import { requireHostRouteAuth } from "@/lib/hostRouteGuard";
import adminCss from "./styles/admin.css?url";

export const Route = createFileRoute("/setup")({
	beforeLoad: requireHostRouteAuth,
	head: () => ({
		links: [{ rel: "stylesheet", href: adminCss }],
		meta: [
			{ title: "Đang mở thiết lập | Campaign Game Studio" },
			{
				name: "description",
				content: "Chuyển thiết lập cũ sang đúng ngữ cảnh chiến dịch hoặc vận hành.",
			},
		],
	}),
	errorComponent: StandaloneAdminRouteError,
	component: SetupCompatibilityRoute,
});

function SetupCompatibilityRoute() {
	const navigate = useNavigate();
	const { isAuthenticated, isLoading } = useConvexAuth();
	const setup = useQuery(api.setup.getSetupState, isAuthenticated ? {} : "skip");

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			void navigate({ to: "/auth", replace: true });
		}
	}, [isAuthenticated, isLoading, navigate]);

	useEffect(() => {
		if (!setup) return;
		if (!setup.hasSetup) {
			void navigate({ to: "/onboarding", replace: true });
			return;
		}
		const campaignId = setup.budgetScope.campaignId ?? setup.selectedCampaign?.id;
		if (campaignId) {
			void navigate({
				to: "/campaigns/$campaignId/rewards",
				params: { campaignId },
				replace: true,
			});
		} else {
			void navigate({ to: "/settings/operations", replace: true });
		}
	}, [navigate, setup]);

	return <main className="grid min-h-dvh place-items-center" role="status">Đang mở thiết lập phù hợp…</main>;
}
