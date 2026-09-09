"use client";

import { Chip, Spinner } from "@heroui/react";
import { ItemCard, ItemCardGroup, Widget } from "@heroui-pro/react";
import { useQuery } from "convex/react";
import { BadgeCheck, CircleAlert, PlugZap } from "lucide-react";
import { SettingsContextNav } from "@/app/_workspace/-components/SettingsContextNav";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";

const groupLabels: Record<string, string> = {
	oauth: "Google OAuth và Convex Auth",
	operations: "Vận hành",
	polar: "Polar",
	r2: "Cloudflare R2",
};

const endpointLabels: Record<string, string> = {
	convexSiteOrigin: "Điểm gốc Convex HTTP Actions",
	googleCallbackUrl: "Địa chỉ callback Google OAuth",
	polarWebhookUrl: "Địa chỉ webhook Polar",
	siteUrlOrigin: "Điểm gốc ứng dụng",
};

const runtimeCheckLabels: Record<string, string> = {
	billingAdminTokenDisabled: "Đã tắt token đồng bộ thanh toán",
	billingAdminTokenShapeSafe: "Token đồng bộ thanh toán an toàn",
	convexSiteUrlHttps: "Điểm gốc Convex dùng HTTPS",
	googleCallbackUrlDerived: "Đã dựng callback Google OAuth",
	googleClientIdShape: "Google OAuth client ID hợp lệ",
	googleClientSecretShape: "Google OAuth client secret hợp lệ",
	jwksShape: "JWKS của Convex Auth hợp lệ",
	jwtPrivateKeyShape: "Khóa riêng JWT của Convex Auth hợp lệ",
	legacyAccountAuthDisabled: "Đã tắt đăng nhập tài khoản cũ",
	legacyOwnerBridgeDisabled: "Đã tắt cầu nối owner cũ",
	migrationTokenDisabled: "Đã tắt token migration",
	migrationTokenShapeSafe: "Token migration an toàn",
	paidPlanFallbackDisabled: "Đã tắt gói trả phí dự phòng",
	polarOrganizationTokenShape: "Token tổ chức Polar hợp lệ",
	polarWebhookSecretShape: "Webhook secret Polar hợp lệ",
	polarWebhookUrlDerived: "Đã dựng webhook Polar",
	productionPolarServer: "Polar đang dùng máy chủ production",
	r2AccessKeyIdShape: "Access key ID của R2 hợp lệ",
	r2BucketNameSafe: "Tên bucket R2 an toàn",
	r2EndpointHttpsOrigin: "Điểm gốc R2 dùng HTTPS",
	r2SecretAccessKeyShape: "Secret access key của R2 hợp lệ",
	r2TokenShape: "Token R2 hợp lệ",
	siteUrlHttps: "Địa chỉ ứng dụng dùng HTTPS",
	siteUrlOriginDerived: "Đã dựng điểm gốc ứng dụng",
	uniqueConfiguredProducts: "Sản phẩm Polar Pro và Business tách biệt",
};

export function IntegrationsSettingsFeature() {
	const readiness = useQuery(api.ops.getHostSaaSReadiness, {});
	if (readiness === undefined) {
		return (
			<div className="grid min-h-[50vh] place-items-center" role="status">
				<Spinner aria-label="Đang tải trạng thái tích hợp" />
			</div>
		);
	}

	return (
		<AdminPageShell
			description="Trạng thái cấu hình và kiểm tra hệ thống dành cho host."
			title="Tích hợp"
		>
			<SettingsContextNav />
			<Widget>
				<Widget.Header>
					<Widget.Title>Mức độ sẵn sàng vận hành</Widget.Title>
					<Widget.Description>
						{readiness.allRequiredReady
							? "Các tích hợp bắt buộc đã sẵn sàng."
							: "Một số cấu hình cần quản trị viên hoàn tất."}
					</Widget.Description>
				</Widget.Header>
				<Widget.Content>
					<ItemCardGroup
						aria-label="Trạng thái tích hợp vận hành"
						className="grid gap-4 md:grid-cols-2"
						variant="secondary"
					>
						{Object.entries(readiness.runtimeChecks).map(([group, checks]) => {
							const ready = checks
								.filter((check) => check.required)
								.every((check) => check.ready);
							const missingLabels = checks
								.filter((check) => check.required && !check.ready)
								.map((check) => runtimeCheckLabels[check.key] ?? check.label);

							return (
								<ItemCard className="items-start" key={group} variant="secondary">
									<ItemCard.Icon className={ready ? "text-success" : "text-warning"}>
										{ready ? (
											<BadgeCheck aria-hidden="true" />
										) : (
											<CircleAlert aria-hidden="true" />
										)}
									</ItemCard.Icon>
									<ItemCard.Content>
										<ItemCard.Title>{groupLabels[group] ?? group}</ItemCard.Title>
										<ItemCard.Description className="whitespace-normal">
											{missingLabels.join(", ") ||
												"Đã vượt qua các kiểm tra bắt buộc."}
										</ItemCard.Description>
									</ItemCard.Content>
									<ItemCard.Action>
										<Chip color={ready ? "success" : "warning"} variant="soft">
											{ready ? "Sẵn sàng" : "Cần kiểm tra"}
										</Chip>
									</ItemCard.Action>
								</ItemCard>
							);
						})}
					</ItemCardGroup>
				</Widget.Content>
			</Widget>
			<Widget>
				<Widget.Header>
					<Widget.Title>Điểm cuối công khai</Widget.Title>
				</Widget.Header>
				<Widget.Content>
					<ItemCardGroup aria-label="Các điểm cuối công khai" variant="secondary">
						{Object.entries(readiness.endpoints).map(([key, value]) => (
							<ItemCard key={key} variant="secondary">
								<ItemCard.Icon>
									<PlugZap aria-hidden="true" />
								</ItemCard.Icon>
								<ItemCard.Content>
									<ItemCard.Title>{endpointLabels[key] ?? key}</ItemCard.Title>
									<ItemCard.Description className="break-all font-mono">
										{value ?? "Chưa cấu hình"}
									</ItemCard.Description>
								</ItemCard.Content>
							</ItemCard>
						))}
					</ItemCardGroup>
				</Widget.Content>
			</Widget>
		</AdminPageShell>
	);
}
