"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { StandaloneAdminRouteError } from "@/app/-auth/StandaloneAdminRouteError";
import { requireHostRouteAuth } from "@/lib/hostRouteGuard";
import { useOwnerSession } from "@/lib/useOwnerSession";
import adminCss from "./styles/admin.css?url";

export const Route = createFileRoute("/draw")({
	beforeLoad: requireHostRouteAuth,
	head: () => ({
		links: [{ rel: "stylesheet", href: adminCss }],
		meta: [
			{ title: "Đang mở bảng vận hành | Campaign Game Studio" },
			{
				name: "description",
				content: "Chuyển lối vào vận hành cũ sang trò chơi chiến dịch mặc định.",
			},
		],
	}),
	errorComponent: StandaloneAdminRouteError,
	component: DrawCompatibilityRoute,
});

function DrawCompatibilityRoute() {
	const navigate = useNavigate();
	const { isAuthenticated, isLoading } = useConvexAuth();
	const owner = useOwnerSession();
	const workspace = useQuery(
		api.campaigns.getWorkspace,
		isAuthenticated && owner ? {} : "skip",
	);
	const ensureDefaultCampaign = useMutation(api.campaigns.ensureDefaultCampaign);
	const campaignGameId =
		workspace?.activeCampaign?.campaignGame.templateId === "li-xi"
			? workspace.activeCampaign.campaignGame.id
			: undefined;

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			void navigate({ to: "/auth", replace: true });
		}
	}, [isAuthenticated, isLoading, navigate]);

	useEffect(() => {
		if (campaignGameId) {
			void navigate({
				to: "/operate/$campaignGameId",
				params: { campaignGameId },
				replace: true,
			});
			return;
		}
		if (workspace && owner) {
			void ensureDefaultCampaign({})
				.then(() => undefined)
				.catch(() => {
					void navigate({ to: "/campaigns", replace: true });
				});
		}
	}, [campaignGameId, ensureDefaultCampaign, navigate, owner, workspace]);

	return (
		<main className="grid min-h-dvh place-items-center bg-background px-6 text-foreground" role="status">
			Đang xác định trò chơi mặc định…
		</main>
	);
}
