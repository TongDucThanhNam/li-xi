"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { AdminRouteStatus } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import { requireHostRouteAuth } from "@/lib/hostRouteGuard";
import { useOwnerSession } from "@/lib/useOwnerSession";
import adminCss from "./styles/admin.css?url";

export const Route = createFileRoute("/")({
	beforeLoad: requireHostRouteAuth,
	head: () => ({
		links: [{ rel: "stylesheet", href: adminCss }],
	}),
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
			to: setupState.hasSetup ? "/campaigns" : "/setup",
			replace: true,
		});
	}, [navigate, owner, setupState]);

	return (
		<AdminRouteStatus
			description="Đang kiểm tra phiên host và ngân sách chiến dịch."
			icon={<ShieldCheck aria-hidden="true" size={22} strokeWidth={2} />}
			status="Checking"
			title="Đang mở trạm"
		/>
	);
}
