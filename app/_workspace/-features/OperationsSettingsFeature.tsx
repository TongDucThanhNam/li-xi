"use client";

import { Alert, Button, Chip, Spinner } from "@heroui/react";
import { Widget } from "@heroui-pro/react";
import { useMutation, useQuery } from "convex/react";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { SettingsContextNav } from "@/app/_workspace/-components/SettingsContextNav";
import OtpPinInput from "@/app/components/OtpPinInput";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import { gameTemplates } from "@/lib/gameTemplates";
import { PIN_LENGTH } from "@/lib/lixiPolicy";

export function OperationsSettingsFeature() {
	const state = useQuery(api.setup.getSetupState, {});
	const setHostPin = useMutation(api.auth.setHostPin);
	const [pin, setPin] = useState("");
	const [editing, setEditing] = useState(false);
	const [pending, setPending] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");

	if (state === undefined) {
		return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải cài đặt vận hành" /></div>;
	}

	const hasPin = Boolean(state.hasHostPin);
	const showForm = !hasPin || editing;

	return (
		<AdminPageShell
			description="Mã vận hành cho trạm chơi, tách biệt với đăng nhập Google."
			tabs={<SettingsContextNav />}
			title="Cài đặt vận hành"
		>
			<Widget className="max-w-xl">
				<Widget.Header>
					<Widget.Title>Host PIN</Widget.Title>
					<Chip color={hasPin ? "success" : "warning"} size="sm" variant="soft">
						{hasPin ? "Đã thiết lập" : "Chưa thiết lập"}
					</Chip>
					<Widget.Description>
						{`Mã ${PIN_LENGTH} số xác nhận thao tác tại chỗ: tạo lượt chơi ${gameTemplates["li-xi"].name}, thoát chế độ trạm và bỏ qua kết quả đang chờ.`}
					</Widget.Description>
				</Widget.Header>
				<Widget.Content className="admin-form">
					{feedback || error ? (
						<Alert status={error ? "danger" : "success"}>
							<Alert.Indicator />
							<Alert.Content><Alert.Title>{error || feedback}</Alert.Title></Alert.Content>
						</Alert>
					) : null}
					{showForm ? (
						<>
							<div className="admin-field">
								<label className="text-sm font-medium text-foreground" htmlFor="host-pin-new">Host PIN mới</label>
								<OtpPinInput
									autoFocus={editing}
									ariaLabel="Host PIN mới"
									disabled={pending}
									inputId="host-pin-new"
									length={PIN_LENGTH}
									onChange={setPin}
									value={pin}
									variant="admin"
								/>
								<p className="admin-field__hint">{`Gồm ${PIN_LENGTH} chữ số. Chỉ chia sẻ với nhân sự vận hành tại chỗ.`}</p>
							</div>
							<div className="flex flex-wrap gap-3">
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
											setEditing(false);
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
								{editing ? (
									<Button
										variant="ghost"
										onPress={() => {
											setPin("");
											setEditing(false);
										}}
									>
										Hủy
									</Button>
								) : null}
							</div>
						</>
					) : (
						<div className="flex flex-wrap items-center gap-3">
							<span className="admin-icon-tile" aria-hidden="true">
								<ShieldCheck size={18} />
							</span>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-medium text-foreground">Host PIN đang hoạt động</p>
								<p className="text-xs text-muted">Đổi mã khi nhân sự vận hành thay đổi.</p>
							</div>
							<Button
								variant="secondary"
								onPress={() => {
									setFeedback("");
									setError("");
									setEditing(true);
								}}
							>
								Đổi Host PIN
							</Button>
						</div>
					)}
				</Widget.Content>
			</Widget>
		</AdminPageShell>
	);
}
