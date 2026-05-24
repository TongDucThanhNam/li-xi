import { Accordion, Chip } from "@heroui/react";
import { ItemCard, ItemCardGroup, NumberValue, Widget } from "@heroui-pro/react";
import {
	BadgeCheck,
	ChevronDown,
	CircleAlert,
	Globe,
	Image,
	RadioTower,
	ServerCog,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import type {
	CampaignAnalyticsView,
	ReadinessEndpointRow,
	ReadinessRow,
	RecentCampaignAsset,
	RuntimeReadinessRow,
} from "./types";

type ReadinessPanelProps = {
	campaignAnalytics: CampaignAnalyticsView;
	contextExpandedKeys: Set<string | number>;
	formHeroAssetId?: Id<"campaignAssets">;
	readinessEndpointRows: ReadinessEndpointRow[];
	readinessReady: boolean;
	readinessRows: ReadinessRow[];
	runtimeReadinessRows: RuntimeReadinessRow[];
	saasReadiness:
		| {
				missingRequired: unknown[];
				missingRuntimeRequired: unknown[];
		  }
		| undefined;
	selectableRecentAssets: RecentCampaignAsset[];
	shareBaseUrl: string;
	onExpandedKeysChange: (keys: Set<string | number>) => void;
	onHeroAssetSelect: (assetId: Id<"campaignAssets">) => void;
};

export function ReadinessPanel({
	campaignAnalytics,
	contextExpandedKeys,
	formHeroAssetId,
	readinessEndpointRows,
	readinessReady,
	readinessRows,
	runtimeReadinessRows,
	saasReadiness,
	selectableRecentAssets,
	shareBaseUrl,
	onExpandedKeysChange,
	onHeroAssetSelect,
}: ReadinessPanelProps) {
	return (
		<Widget>
			<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
				<div>
					<Widget.Title>Workspace details</Widget.Title>
					<Widget.Description>Readiness, metrics, links, and reusable assets.</Widget.Description>
				</div>
				<Chip color={readinessReady ? "success" : "danger"} variant="soft">
					{saasReadiness === undefined
						? "Checking"
						: readinessReady
							? "Ready"
							: `${
									saasReadiness.missingRequired.length +
									saasReadiness.missingRuntimeRequired.length
								} missing`}
				</Chip>
			</Widget.Header>
			<Widget.Content className="p-0">
				<Accordion
					allowsMultipleExpanded
					className="admin-context-accordion"
					expandedKeys={contextExpandedKeys}
					variant="surface"
					onExpandedChange={(keys) => onExpandedKeysChange(keys as Set<string | number>)}
				>
					<Accordion.Item id="readiness">
						<Accordion.Heading>
							<Accordion.Trigger>
								<ServerCog aria-hidden="true" className="size-4 text-muted" />
								SaaS readiness
								<Accordion.Indicator>
									<ChevronDown aria-hidden="true" className="size-4" />
								</Accordion.Indicator>
							</Accordion.Trigger>
						</Accordion.Heading>
						<Accordion.Panel>
							<Accordion.Body className="grid gap-3 p-3">
								{saasReadiness === undefined ? (
									<div className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
								) : (
									<ItemCardGroup variant="secondary">
										{readinessRows.map((row) => {
											const isReady = row.missingLabels.length === 0;
											return (
												<ItemCard key={row.key} variant="secondary">
													<ItemCard.Icon
														className={isReady ? "text-success" : "text-danger"}
													>
														{isReady ? (
															<BadgeCheck aria-hidden="true" size={18} strokeWidth={2} />
														) : (
															<CircleAlert aria-hidden="true" size={18} strokeWidth={2} />
														)}
													</ItemCard.Icon>
													<ItemCard.Content>
														<ItemCard.Title>{row.label}</ItemCard.Title>
														<ItemCard.Description className="whitespace-normal">
															{isReady
																? "Đủ biến bắt buộc"
																: `Thiếu ${row.missingLabels.join(", ")}`}
														</ItemCard.Description>
													</ItemCard.Content>
													<ItemCard.Action>
														<Chip
															color={isReady ? "success" : "danger"}
															size="sm"
															variant="soft"
														>
															{row.configuredRequiredCount}/{row.requiredCount}
														</Chip>
													</ItemCard.Action>
												</ItemCard>
											);
										})}
										{runtimeReadinessRows.map((row) => (
											<ItemCard key={row.key} variant="secondary">
												<ItemCard.Icon
													className={row.isReady ? "text-success" : "text-danger"}
												>
													{row.isReady ? (
														<BadgeCheck aria-hidden="true" size={18} strokeWidth={2} />
													) : (
														<CircleAlert aria-hidden="true" size={18} strokeWidth={2} />
													)}
												</ItemCard.Icon>
												<ItemCard.Content>
													<ItemCard.Title>{row.label}</ItemCard.Title>
													<ItemCard.Description className="whitespace-normal">
														{row.detail}
													</ItemCard.Description>
												</ItemCard.Content>
												<ItemCard.Action>
													<Chip
														color={row.isReady ? "success" : "danger"}
														size="sm"
														variant="soft"
													>
														{row.isReady ? "Ready" : "Thiếu"}
													</Chip>
												</ItemCard.Action>
											</ItemCard>
										))}
										{readinessEndpointRows.map((row) => (
											<ItemCard key={row.key} variant="secondary">
												<ItemCard.Icon>
													<Globe aria-hidden="true" size={18} strokeWidth={2} />
												</ItemCard.Icon>
												<ItemCard.Content>
													<ItemCard.Title>{row.label}</ItemCard.Title>
													<ItemCard.Description className="break-all font-mono">
														{row.value}
													</ItemCard.Description>
												</ItemCard.Content>
												<ItemCard.Action>
													<Chip size="sm" variant="soft">
														Endpoint
													</Chip>
												</ItemCard.Action>
											</ItemCard>
										))}
									</ItemCardGroup>
								)}
							</Accordion.Body>
						</Accordion.Panel>
					</Accordion.Item>

					<Accordion.Item id="metrics">
						<Accordion.Heading>
							<Accordion.Trigger>
								<RadioTower aria-hidden="true" className="size-4 text-muted" />
								Campaign metrics
								<Accordion.Indicator>
									<ChevronDown aria-hidden="true" className="size-4" />
								</Accordion.Indicator>
							</Accordion.Trigger>
						</Accordion.Heading>
						<Accordion.Panel>
							<Accordion.Body className="p-3">
								<ItemCardGroup variant="secondary">
									{[
										{
											label: "Lượt tạo",
											value: campaignAnalytics?.sessionCreatedEvents,
										},
										{
											label: "Đã trao",
											value: campaignAnalytics?.redemptionCreatedEvents,
										},
										{
											label: "Aggregate",
											value: campaignAnalytics?.aggregatedRedemptionCount,
										},
										{
											label: "Tổng thưởng",
											value: campaignAnalytics?.aggregatedRedeemedAmount,
											currency: true,
										},
									].map((metric) => (
										<ItemCard key={metric.label} variant="secondary">
											<ItemCard.Content>
												<ItemCard.Description>{metric.label}</ItemCard.Description>
												<ItemCard.Title>
													{metric.value === undefined ? (
														"--"
													) : metric.currency ? (
														<NumberValue
															className="tabular-nums"
															currency="VND"
															maximumFractionDigits={0}
															style="currency"
															value={metric.value}
														/>
													) : (
														<NumberValue
															className="tabular-nums"
															locale="vi-VN"
															value={metric.value}
														/>
													)}
												</ItemCard.Title>
											</ItemCard.Content>
										</ItemCard>
									))}
								</ItemCardGroup>
							</Accordion.Body>
						</Accordion.Panel>
					</Accordion.Item>

					<Accordion.Item id="links">
						<Accordion.Heading>
							<Accordion.Trigger>
								<Globe aria-hidden="true" className="size-4 text-muted" />
								Public link base
								<Accordion.Indicator>
									<ChevronDown aria-hidden="true" className="size-4" />
								</Accordion.Indicator>
							</Accordion.Trigger>
						</Accordion.Heading>
						<Accordion.Panel>
							<Accordion.Body className="p-3">
								<ItemCard variant="secondary">
									<ItemCard.Content>
										<ItemCard.Title>Claim route</ItemCard.Title>
										<ItemCard.Description className="break-all font-mono">
											{shareBaseUrl}/claim/&lt;publicCode&gt;
										</ItemCard.Description>
									</ItemCard.Content>
								</ItemCard>
							</Accordion.Body>
						</Accordion.Panel>
					</Accordion.Item>

					{selectableRecentAssets.length > 0 ? (
						<Accordion.Item id="assets">
							<Accordion.Heading>
								<Accordion.Trigger>
									<Image aria-hidden="true" className="size-4 text-muted" />
									Ảnh gần đây
									<Accordion.Indicator>
										<ChevronDown aria-hidden="true" className="size-4" />
									</Accordion.Indicator>
								</Accordion.Trigger>
							</Accordion.Heading>
							<Accordion.Panel>
								<Accordion.Body className="p-3">
									<ItemCardGroup variant="secondary">
										{selectableRecentAssets.map((asset) => {
											const isSelected = asset.id === formHeroAssetId;

											return (
												<ItemCard<"button">
													className="w-full cursor-pointer items-center"
													key={asset.id}
													render={(props) => <button type="button" {...props} />}
													variant={isSelected ? "default" : "secondary"}
													onClick={() => onHeroAssetSelect(asset.id)}
												>
													<ItemCard.Icon className="h-12 w-16 overflow-hidden rounded-lg p-0">
														<img
															alt={asset.fileName}
															className="h-full w-full object-cover"
															src={asset.url}
														/>
													</ItemCard.Icon>
													<ItemCard.Content>
														<ItemCard.Title>{asset.fileName}</ItemCard.Title>
														<ItemCard.Description>
															{isSelected ? "Đang dùng làm hero" : "Chọn làm hero"}
														</ItemCard.Description>
													</ItemCard.Content>
													<ItemCard.Action>
														<Chip
															color={isSelected ? "success" : "default"}
															size="sm"
															variant="soft"
														>
															{isSelected ? "Selected" : "Asset"}
														</Chip>
													</ItemCard.Action>
												</ItemCard>
											);
										})}
									</ItemCardGroup>
								</Accordion.Body>
							</Accordion.Panel>
						</Accordion.Item>
					) : null}
				</Accordion>
			</Widget.Content>
		</Widget>
	);
}
