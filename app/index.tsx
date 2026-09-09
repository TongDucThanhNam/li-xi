"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { AdminRouteStatus } from "@/app/components/AdminPageShell";
import { StandaloneAdminRouteError } from "@/app/-auth/StandaloneAdminRouteError";
import { api } from "@/convex/_generated/api";
import { requireHostRouteAuth } from "@/lib/hostRouteGuard";
import { useOwnerSession } from "@/lib/useOwnerSession";
import adminCss from "./styles/admin.css?url";

export const Route = createFileRoute("/")({
	beforeLoad: requireHostRouteAuth,
	head: () => ({
		links: [{ rel: "stylesheet", href: adminCss }],
		meta: [
			{ title: "Đang mở | Campaign Game Studio" },
			{
				name: "description",
				content: "Kiểm tra phiên host và mở đúng trạng thái của không gian làm việc.",
			},
		],
	}),
	errorComponent: StandaloneAdminRouteError,
	component: HomePage,
});

function HomePage() {
	const navigate = useNavigate();
	const owner = useOwnerSession();
	const setupState = useQuery(
		api.setup.getSetupState,
		owner ? {} : "skip",
	);

	useEffect(() => {
		if (owner === null) {
			void navigate({ to: "/auth", replace: true });
			return;
		}

		if (!owner || !setupState) {
			return;
		}

		void navigate({
			to: setupState.hasSetup ? "/campaigns" : "/onboarding",
			replace: true,
		});
	}, [navigate, owner, setupState]);

	return (
		<AdminRouteStatus
			description="Đang kiểm tra phiên host và mức độ sẵn sàng của không gian làm việc."
			icon={<ShieldCheck aria-hidden="true" size={22} strokeWidth={2} />}
			status="Đang kiểm tra"
			title="Đang mở không gian làm việc"
		/>
	);
}
