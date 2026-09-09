"use client";

import { Alert, Button, Spinner } from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";

export const Route = createFileRoute("/_workspace/onboarding")({
	head: () => ({
		meta: [
			{ title: "Bắt đầu | Campaign Game Studio" },
			{
				name: "description",
				content: "Khởi tạo chiến dịch đầu tiên và tiếp tục vào Campaign Studio.",
			},
		],
	}),
	component: OnboardingRoute,
});

function OnboardingRoute() {
	const navigate = useNavigate();
	const setup = useQuery(api.setup.getSetupState, {});
	const ensureCampaign = useMutation(api.campaigns.ensureDefaultCampaign);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");

	if (setup === undefined) {
		return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải trạng thái bắt đầu" /></div>;
	}

	return (
		<AdminPageShell
			description="Khởi tạo chiến dịch đầu tiên; luật chơi và phần thưởng được cấu hình ở bước tiếp theo."
			title="Bắt đầu với Campaign Studio"
		>
			{error ? <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>{error}</Alert.Title></Alert.Content></Alert> : null}
			<EmptyState>
				<EmptyState.Header>
					<EmptyState.Media variant="icon"><Sparkles aria-hidden="true" /></EmptyState.Media>
					<EmptyState.Title>
						{setup?.campaigns.length ? "Chiến dịch đầu tiên đã sẵn sàng" : "Tạo chiến dịch đầu tiên"}
					</EmptyState.Title>
					<EmptyState.Description>
						Mỗi chiến dịch có thể chứa một hoặc nhiều trải nghiệm trò chơi đã đăng ký.
					</EmptyState.Description>
				</EmptyState.Header>
				<EmptyState.Content>
					<Button
						isPending={pending}
						onPress={async () => {
							setPending(true);
							setError("");
							try {
								const result = await ensureCampaign({});
								void navigate({
									to: "/campaigns/$campaignId",
									params: { campaignId: result.campaignId },
									replace: true,
								});
							} catch (unknownError) {
								setError(unknownError instanceof Error ? unknownError.message : "Không thể chuẩn bị chiến dịch đầu tiên");
							} finally {
								setPending(false);
							}
						}}
					>
						{setup?.campaigns.length ? "Mở chiến dịch" : "Tạo chiến dịch"}
					</Button>
				</EmptyState.Content>
			</EmptyState>
		</AdminPageShell>
	);
}
