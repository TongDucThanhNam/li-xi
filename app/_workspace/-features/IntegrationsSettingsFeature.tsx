"use client";

import { Alert, Button, Chip, Spinner } from "@heroui/react";
import { Widget } from "@heroui-pro/react";
import { useQuery } from "convex/react";
import { BadgeCheck, Check, CircleAlert, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { AdminDisclosure } from "@/app/components/AdminDisclosure";
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

type RuntimeCheck = { key: string; label: string; required: boolean; ready: boolean };

export function IntegrationsSettingsFeature() {
	const readiness = useQuery(api.ops.getHostSaaSReadiness, {});
	const [copiedKey, setCopiedKey] = useState<string | null>(null);
	const [copyError, setCopyError] = useState("");
	const copyTimer = useRef<number | null>(null);

	if (readiness === undefined) {
		return (
			<div className="grid min-h-[50vh] place-items-center" role="status">
				<Spinner aria-label="Đang tải trạng thái tích hợp" />
			</div>
		);
	}

	const groups = Object.entries(readiness.runtimeChecks) as Array<[string, RuntimeCheck[]]>;
	const notReadyGroups = groups.filter(
		([, checks]) => !checks.filter((check) => check.required).every((check) => check.ready),
	);
	const totalChecks = groups.reduce((sum, [, checks]) => sum + checks.length, 0);

	const copyEndpoint = async (key: string, label: string, value: string) => {
		try {
			if (!navigator.clipboard) throw new Error("Trình duyệt không hỗ trợ sao chép tự động");
			await navigator.clipboard.writeText(value);
			setCopyError("");
			setCopiedKey(key);
			if (copyTimer.current) window.clearTimeout(copyTimer.current);
			copyTimer.current = window.setTimeout(() => setCopiedKey(null), 2000);
		} catch (unknownError) {
			setCopyError(unknownError instanceof Error ? unknownError.message : "Trình duyệt không hỗ trợ sao chép tự động");
		}
	};

	return (
		<AdminPageShell
			description="Trạng thái cấu hình hệ thống dành cho host."
			tabs={<SettingsContextNav />}
			title="Tích hợp"
		>
			{copyError ? (
				<Alert status="danger">
					<Alert.Indicator />
					<Alert.Content><Alert.Title>{copyError}</Alert.Title></Alert.Content>
				</Alert>
			) : null}
			{copiedKey ? <span className="sr-only" role="status">Đã sao chép</span> : null}
			<Widget>
				<Widget.Header>
					<Widget.Title>Trạng thái hệ thống</Widget.Title>
					<Chip color={readiness.allRequiredReady ? "success" : "warning"} size="sm" variant="soft">
						{readiness.allRequiredReady ? "Tất cả sẵn sàng" : `${notReadyGroups.length} nhóm cần kiểm tra`}
					</Chip>
					<Widget.Description>
						{readiness.allRequiredReady
							? "Các tích hợp bắt buộc đã sẵn sàng."
							: "Một số cấu hình cần quản trị viên hoàn tất."}
					</Widget.Description>
				</Widget.Header>
				<Widget.Content className="flex flex-col gap-4">
					<ul aria-label="Trạng thái tích hợp vận hành" className="admin-rows">
						{groups.map(([group, checks]) => {
							const required = checks.filter((check) => check.required);
							const ready = required.every((check) => check.ready);
							const missingLabels = checks
								.filter((check) => check.required && !check.ready)
								.map((check) => runtimeCheckLabels[check.key] ?? check.label);
							return (
								<li className="admin-row py-3" key={group}>
									<span aria-hidden="true" className={ready ? "shrink-0 text-success" : "shrink-0 text-warning"}>
										{ready ? <BadgeCheck size={18} /> : <CircleAlert size={18} />}
									</span>
									<span className="admin-row__text">
										<span className="text-sm font-medium text-foreground">{groupLabels[group] ?? group}</span>
										{ready ? null : <span className="text-sm text-muted">{missingLabels.join(", ")}</span>}
									</span>
									{ready ? (
										<span className="shrink-0 text-xs tabular-nums text-muted">
											{required.filter((check) => check.ready).length}/{required.length} kiểm tra bắt buộc
										</span>
									) : (
										<Chip color="warning" size="sm" variant="soft">Cần kiểm tra</Chip>
									)}
								</li>
							);
						})}
					</ul>
					<AdminDisclosure
						defaultExpanded={notReadyGroups.length > 0}
						summary={`${totalChecks} kiểm tra`}
						title="Chi tiết kiểm tra"
					>
						{groups.map(([group, checks]) => (
							<div key={group}>
								<p className="admin-group-label">{groupLabels[group] ?? group}</p>
								<ul className="mt-2 flex flex-col gap-1.5">
									{checks.map((check) => (
										<li className="flex items-start gap-2 text-sm" key={check.key}>
											{check.ready ? (
												<Check aria-hidden="true" className="mt-0.5 shrink-0 text-success" size={14} />
											) : (
												<CircleAlert aria-hidden="true" className="mt-0.5 shrink-0 text-warning" size={14} />
											)}
											<span>
												{runtimeCheckLabels[check.key] ?? check.label}
												{check.required === false ? <span className="text-muted"> · không bắt buộc</span> : null}
											</span>
										</li>
									))}
								</ul>
							</div>
						))}
					</AdminDisclosure>
				</Widget.Content>
			</Widget>
			<Widget>
				<Widget.Header>
					<Widget.Title>Điểm cuối công khai</Widget.Title>
					<Widget.Description>Dùng khi cấu hình Google OAuth, webhook Polar và tên miền ứng dụng.</Widget.Description>
				</Widget.Header>
				<Widget.Content>
					<ul aria-label="Các điểm cuối công khai" className="admin-rows">
						{(Object.entries(readiness.endpoints) as Array<[string, string | null]>).map(([key, value]) => {
							const label = endpointLabels[key] ?? key;
							return (
								<li className="admin-row py-3" key={key}>
									<span className="admin-row__text">
										<span className="text-sm font-medium text-foreground">{label}</span>
										{value ? (
											<span className="break-all font-mono text-xs text-muted">{value}</span>
										) : (
											<span className="text-xs text-warning">Chưa cấu hình</span>
										)}
									</span>
									{value ? (
										<Button
											aria-label={`Sao chép ${label}`}
											isIconOnly
											size="sm"
											variant="ghost"
											onPress={() => void copyEndpoint(key, label, value)}
										>
											{copiedKey === key ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
										</Button>
									) : null}
								</li>
							);
						})}
					</ul>
				</Widget.Content>
			</Widget>
		</AdminPageShell>
	);
}
