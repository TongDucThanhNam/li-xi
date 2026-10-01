"use client";

import { ProgressBar } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { PLAN_RESOURCE_LABELS, PLAN_TIER_NAMES } from "@/app/_workspace/-components/planCopy";
import { api } from "@/convex/_generated/api";
import { tightestResource, usageLevel, usagePercent } from "@/lib/planUsage";

export function WorkspacePlanCard() {
	const plan = useQuery(api.entitlements.getPlanState, {});
	if (!plan) return null;
	const tightest = tightestResource(plan.resources);
	const level = tightest ? usageLevel(tightest.resource) : "ok";
	const planName = `Gói ${PLAN_TIER_NAMES[plan.tier]}`;
	return (
		<Link aria-label={`${planName}. Mở trang thanh toán`} className="admin-sidebar-plan" to="/settings/billing">
			<span className="flex items-center justify-between gap-2">
				<span className="truncate text-xs font-semibold text-foreground">{planName}</span>
				{plan.tier === "business" ? null : <span className="text-xs font-medium text-accent">Nâng cấp</span>}
			</span>
			{tightest ? (
				<>
					<span className="flex items-center justify-between gap-2 text-xs text-muted">
						<span className="truncate">{PLAN_RESOURCE_LABELS[tightest.key]}</span>
						<span className="tabular-nums">{tightest.resource.used}/{tightest.resource.limit}</span>
					</span>
					<ProgressBar
						aria-label={`Mức sử dụng ${PLAN_RESOURCE_LABELS[tightest.key]}`}
						color={level === "full" ? "danger" : level === "near" ? "warning" : "accent"}
						size="sm"
						value={usagePercent(tightest.resource)}
					>
						<ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
					</ProgressBar>
				</>
			) : null}
		</Link>
	);
}
