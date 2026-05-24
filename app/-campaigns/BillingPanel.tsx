import { Alert, Button, Chip, ProgressBar } from "@heroui/react";
import { ItemCard, ItemCardGroup, Widget } from "@heroui-pro/react";
import { ExternalLink } from "lucide-react";
import { formatBillingPrice } from "./utils";
import type {
	BillingAction,
	BillingPlanKey,
	BillingPlanOption,
	BillingProduct,
	PlanResource,
} from "./types";

type BillingPlanState = {
	label?: string;
	source?: string;
	billingError?: string | null;
	subscription?: {
		productId?: string | null;
		productName: string;
		status: string;
	} | null;
};

type BillingPanelProps = {
	billingAction: BillingAction;
	billingPlans: BillingPlanOption[];
	planRows: Array<{ label: string; resource: PlanResource }>;
	planState?: BillingPlanState;
	formatPlanResource: (resource: PlanResource) => string;
	onBillingPlan: (planKey: BillingPlanKey, product: BillingProduct) => void;
	onBillingPortal: () => void;
	planPercent: (resource: PlanResource) => number;
};

export function BillingPanel({
	billingAction,
	billingPlans,
	planRows,
	planState,
	formatPlanResource,
	onBillingPlan,
	onBillingPortal,
	planPercent,
}: BillingPanelProps) {
	return (
		<Widget>
			<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
				<div>
					<Widget.Title>Plan</Widget.Title>
					<Widget.Description>{planState?.label ?? "Đang tải"}</Widget.Description>
				</div>
				<Chip
					color={planState?.source === "polar" ? "success" : "default"}
					variant="soft"
				>
					{planState?.source === "polar" ? "Polar active" : "Fallback"}
				</Chip>
			</Widget.Header>
			<Widget.Content className="gap-4">
				{planState?.subscription ? (
					<ItemCard variant="secondary">
						<ItemCard.Content>
							<ItemCard.Title>{planState.subscription.productName}</ItemCard.Title>
							<ItemCard.Description>Subscription hiện tại</ItemCard.Description>
						</ItemCard.Content>
						<ItemCard.Action>
							<Chip color="success" size="sm" variant="soft">
								{planState.subscription.status}
							</Chip>
						</ItemCard.Action>
					</ItemCard>
				) : planState?.billingError ? (
					<Alert status="danger">
						<Alert.Indicator />
						<Alert.Content>
							<Alert.Title>{planState.billingError}</Alert.Title>
						</Alert.Content>
					</Alert>
				) : null}
				<ItemCardGroup variant="secondary">
					{billingPlans.map((plan) => {
						const product = plan.product;
						const isCurrent =
							Boolean(product?.id) &&
							planState?.subscription?.productId === product?.id;
						const isBusy = billingAction === plan.key;
						const isDisabled =
							Boolean(billingAction) || isCurrent || !product?.id;
						const statusLabel = isBusy
							? "Đang xử lý"
							: isCurrent
								? "Đang dùng"
								: product?.id
									? "Có thể chọn"
									: "Chưa có product";

						return (
							<ItemCard key={plan.key} variant={isCurrent ? "default" : "secondary"}>
								<ItemCard.Content>
									<ItemCard.Title>
										{plan.label}
										{isCurrent ? (
											<Chip className="ml-2 align-middle" size="sm" variant="soft">
												Current
											</Chip>
										) : null}
									</ItemCard.Title>
									<ItemCard.Description>
										{formatBillingPrice(product)} ·{" "}
										{product?.id ? plan.summary : statusLabel}
									</ItemCard.Description>
								</ItemCard.Content>
								<ItemCard.Action>
									<Button
										isDisabled={isDisabled}
										size="sm"
										type="button"
										variant={isCurrent ? "secondary" : "outline"}
										onPress={() => onBillingPlan(plan.key, product)}
									>
										{statusLabel}
									</Button>
								</ItemCard.Action>
							</ItemCard>
						);
					})}
				</ItemCardGroup>
				<Button
					fullWidth
					isDisabled={Boolean(billingAction) || !planState?.subscription}
					type="button"
					variant="outline"
					onPress={onBillingPortal}
				>
					<ExternalLink aria-hidden="true" size={16} strokeWidth={2} />
					{billingAction === "portal"
						? "Đang mở portal..."
						: planState?.subscription
							? "Quản lý subscription"
							: "Chưa có subscription"}
				</Button>
				<ItemCardGroup variant="transparent">
					<ItemCardGroup.Header className="px-1.5">
						<ItemCardGroup.Title>Usage</ItemCardGroup.Title>
						<ItemCardGroup.Description>
							Giới hạn gói hiện tại cho workspace này.
						</ItemCardGroup.Description>
					</ItemCardGroup.Header>
					{planRows.map((row) => (
						<ItemCard className="items-start" key={row.label} variant="secondary">
							<ItemCard.Content className="gap-2">
								<div className="flex items-center justify-between gap-3">
									<ItemCard.Title>{row.label}</ItemCard.Title>
									<span
										className={
											row.resource.isExceeded || row.resource.isFull
												? "text-xs font-medium text-danger"
												: "text-xs text-foreground"
										}
									>
										{formatPlanResource(row.resource)}
									</span>
								</div>
								<ProgressBar
									aria-label={`${row.label} usage`}
									color={
										row.resource.isExceeded || row.resource.isFull
											? "danger"
											: "accent"
									}
									value={planPercent(row.resource)}
								>
									<ProgressBar.Track>
										<ProgressBar.Fill />
									</ProgressBar.Track>
								</ProgressBar>
							</ItemCard.Content>
						</ItemCard>
					))}
				</ItemCardGroup>
			</Widget.Content>
		</Widget>
	);
}
