"use client";

import { Alert, Button, Spinner } from "@heroui/react";
import { Widget } from "@heroui-pro/react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { SettingsContextNav } from "@/app/_workspace/-components/SettingsContextNav";
import OtpPinInput from "@/app/components/OtpPinInput";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import { PIN_LENGTH } from "@/lib/lixiPolicy";

export function OperationsSettingsFeature() {
	const state = useQuery(api.setup.getSetupState, {});
	const setHostPin = useMutation(api.auth.setHostPin);
	const [pin, setPin] = useState("");
	const [pending, setPending] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");

	if (state === undefined) {
		return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải cài đặt vận hành" /></div>;
	}

	return (
		<AdminPageShell
			description="Mã vận hành cho trạm chơi, tách biệt với đăng nhập Google."
			title="Cài đặt vận hành"
		>
			<SettingsContextNav />
			<Widget className="max-w-xl">
				<Widget.Header>
					<Widget.Title>Host PIN</Widget.Title>
					<Widget.Description>
						{state?.hasHostPin ? "Host PIN đã được cấu hình." : "Thiết lập Host PIN trước khi vận hành trạm."}
					</Widget.Description>
				</Widget.Header>
				<Widget.Content className="gap-4">
					{feedback || error ? (
						<Alert status={error ? "danger" : "success"}>
							<Alert.Indicator />
							<Alert.Content><Alert.Title>{error || feedback}</Alert.Title></Alert.Content>
						</Alert>
					) : null}
					<div className="admin-field">
						<p className="text-sm font-medium text-foreground">Host PIN mới</p>
						<OtpPinInput
							disabled={pending}
							length={PIN_LENGTH}
							onChange={setPin}
							value={pin}
							variant="admin"
						/>
					</div>
					<Button
						isDisabled={pin.length !== PIN_LENGTH}
						isPending={pending}
						onPress={async () => {
							setPending(true);
							setFeedback("");
							setError("");
							try {
								await setHostPin({ pin });
								setPin("");
								setFeedback("Đã cập nhật Host PIN.");
							} catch (unknownError) {
								setError(unknownError instanceof Error ? unknownError.message : "Không thể cập nhật Host PIN");
							} finally {
								setPending(false);
							}
						}}
					>
						Lưu Host PIN
					</Button>
				</Widget.Content>
			</Widget>
		</AdminPageShell>
	);
}
