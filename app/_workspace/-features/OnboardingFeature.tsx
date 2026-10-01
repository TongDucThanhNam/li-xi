"use client";

import { Alert, Button, Spinner } from "@heroui/react";
import { Widget } from "@heroui-pro/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Check } from "lucide-react";
import { useState } from "react";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";

/**
 * First-run bootstrap: create (or open) the first campaign, then continue
 * into Campaign Studio. Route wiring and metadata live in the route entry.
 */
export function OnboardingFeature() {
	const navigate = useNavigate();
	const setup = useQuery(api.setup.getSetupState, {});
	const ensureCampaign = useMutation(api.campaigns.ensureDefaultCampaign);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");

	if (setup === undefined) {
		return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải trạng thái bắt đầu" /></div>;
	}

	const hasCampaign = setup.campaigns.length > 0;
	const steps = [
		{
			title: "Tạo chiến dịch",
			text: hasCampaign ? "Chiến dịch đầu tiên đã sẵn sàng." : "Hệ thống tạo sẵn một chiến dịch kèm trò chơi đầu tiên để bạn bắt đầu nhanh.",
		},
		{
			title: "Chỉnh thương hiệu và trò chơi",
			text: "Đặt tên, logo, nội dung hiển thị; thêm hoặc đổi mẫu trò chơi.",
		},
		{
			title: "Thêm phần thưởng và phát hành",
			text: "Thiết lập phần thưởng, rồi chia sẻ liên kết, mã QR hoặc mở trạm chơi.",
		},
	];

	return (
		<AdminPageShell
			description="Ba bước để đưa trò chơi đầu tiên đến khách hàng."
			title="Bắt đầu với Campaign Studio"
		>
			{error ? <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>{error}</Alert.Title></Alert.Content></Alert> : null}
			<Widget className="max-w-2xl">
				<Widget.Content className="admin-form">
					<ol className="admin-steps">
						{steps.map((step, index) => {
							const done = index === 0 && hasCampaign;
							return (
								<li className="admin-step" key={step.title}>
									<span aria-hidden="true" className="admin-step__index" data-done={done ? "true" : undefined}>
										{done ? <Check size={14} /> : index + 1}
									</span>
									<div className="min-w-0">
										<p className="admin-step__title">{step.title}</p>
										<p className="admin-step__text">{step.text}</p>
									</div>
								</li>
							);
						})}
					</ol>
					<div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-5">
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
							{hasCampaign ? "Mở chiến dịch" : "Tạo chiến dịch đầu tiên"}
						</Button>
						<Link className="text-sm font-medium text-accent" to="/campaigns/new">Tự tạo từ đầu</Link>
					</div>
				</Widget.Content>
			</Widget>
		</AdminPageShell>
	);
}
