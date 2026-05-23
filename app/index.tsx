"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { requireHostRouteAuth } from "@/lib/hostRouteGuard";
import { useOwnerSession } from "@/lib/useOwnerSession";

export const Route = createFileRoute("/")({
	beforeLoad: requireHostRouteAuth,
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
		<main className="grid min-h-screen place-items-center bg-black-ink px-6 text-center text-text-primary">
			<section className="grid gap-5">
				<div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-gold-base/20 border-t-gold-base" />
				<div>
					<p className="font-cinzel text-xl text-gold-shine">Đang mở trạm</p>
					<p className="mt-2 font-vn text-sm text-text-secondary">
						Đang kiểm tra phiên host và ngân sách chiến dịch.
					</p>
				</div>
			</section>
		</main>
	);
}
