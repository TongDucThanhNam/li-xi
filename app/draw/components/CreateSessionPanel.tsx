import OtpPinInput from "@/app/components/OtpPinInput";
import type { Id } from "@/convex/_generated/dataModel";
import { buildPublicClaimUrl } from "@/lib/publicAppUrl";
import {
	Check,
	Clipboard,
	ExternalLink,
	Gift,
	Link,
	XCircle,
} from "lucide-react";

type DeliveryMode = "station" | "link";

type PendingLinkSession = {
	id: Id<"drawSessions">;
	guestNameDisplay: string;
	sharePath: string;
	campaignName: string | null;
	createdAt: number;
	expiresAt: number;
};

type CreateSessionPanelProps = {
	guestName: string;
	hostPin: string;
	deliveryMode: DeliveryMode;
	sharePath: string | null;
	shareExpiresAt: number | null;
	pendingLinkSessions: PendingLinkSession[];
	cancellingSessionId: Id<"drawSessions"> | null;
	pinLength: number;
	loading: boolean;
	onGuestNameChange: (value: string) => void;
	onHostPinChange: (value: string) => void;
	onDeliveryModeChange: (value: DeliveryMode) => void;
	onCancelLinkSession: (sessionId: Id<"drawSessions">) => void;
	onCreate: () => void;
};

export default function CreateSessionPanel({
	guestName,
	hostPin,
	deliveryMode,
	sharePath,
	shareExpiresAt,
	pendingLinkSessions,
	cancellingSessionId,
	pinLength,
	loading,
	onGuestNameChange,
	onHostPinChange,
	onDeliveryModeChange,
	onCancelLinkSession,
	onCreate,
}: CreateSessionPanelProps) {
	const canSubmit =
		!loading && guestName.trim().length >= 2 && hostPin.length === pinLength;
	const hasGuestNameError = guestName.length > 0 && guestName.trim().length < 2;
	const shareUrl = sharePath ? buildPublicClaimUrl(sharePath) : sharePath;
	const buildShareUrl = (path: string) => buildPublicClaimUrl(path);
	const formatExpiry = (expiresAt: number) =>
		new Intl.DateTimeFormat("vi-VN", {
			dateStyle: "short",
			timeStyle: "short",
		}).format(new Date(expiresAt));

	return (
		<div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-gold-base/35 bg-linear-to-br from-[#170606] to-[#3a0707] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md transition-colors hover:border-gold-base/55 sm:p-6">
			<div className="absolute inset-[3px] rounded-[13px] border border-gold-base/10 pointer-events-none" />

			<div className="relative z-10 mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
				<div className="mb-5 flex items-center gap-3">
					<div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-base/10 text-gold-base">
						<Gift aria-hidden="true" size={20} strokeWidth={2} />
					</div>
					<div className="min-w-0">
						<h2 className="font-playfair text-[28px] leading-tight tracking-[0.01em] text-transparent bg-linear-to-b from-gold-shine via-gold-shine to-gold-base bg-clip-text drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
							Tạo lượt rút mới
						</h2>
						<p className="mt-1 font-vn text-sm text-gold-shine/45">
							Chọn chế độ, nhập khách và xác nhận bằng PIN host.
						</p>
					</div>
				</div>

				<div className="grid min-h-0 gap-5 overflow-y-auto pr-1 custom-scrollbar">
					<div className="grid grid-cols-2 rounded-xl border border-gold-base/25 bg-black-ink/50 p-1">
						{(["station", "link"] as const).map((mode) => (
							<button
								key={mode}
								type="button"
								className={`rounded-lg px-3 py-2 font-vn text-sm font-bold transition-all ${
									deliveryMode === mode
										? "bg-gold-base text-red-deep shadow-[0_0_18px_rgba(212,175,55,0.2)]"
										: "text-gold-shine/60 hover:bg-gold-base/10 hover:text-gold-shine"
								}`}
								onClick={() => onDeliveryModeChange(mode)}
							>
								{mode === "station" ? "Trạm trực tiếp" : "Share link"}
							</button>
						))}
					</div>

					{deliveryMode === "link" && shareUrl ? (
						<div className="rounded-xl border border-gold-base/30 bg-black-ink/45 p-3">
							<div className="flex items-center justify-between gap-3">
								<div className="min-w-0">
									<p className="font-vn text-[11px] font-bold uppercase tracking-[0.18em] text-gold-base/70">
										Link rút công khai
									</p>
									<p className="mt-1 truncate font-mono text-xs text-gold-shine/75">
										{shareUrl}
									</p>
									{shareExpiresAt ? (
										<p className="mt-1 font-vn text-[11px] text-gold-shine/45">
											Hết hạn {formatExpiry(shareExpiresAt)}
										</p>
									) : null}
								</div>
								<button
									type="button"
									className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gold-base/35 px-3 py-2 font-vn text-xs font-bold text-gold-base transition-colors hover:bg-gold-base/10"
									onClick={() => {
										if (shareUrl) {
											void navigator.clipboard?.writeText(shareUrl);
										}
									}}
								>
									<Clipboard aria-hidden="true" size={13} strokeWidth={2} />
									Copy
								</button>
							</div>
							<button
								type="button"
								className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-gold-base/35 bg-gold-base/10 px-4 py-2.5 font-cinzel text-sm font-bold uppercase tracking-widest text-gold-shine transition-colors hover:bg-gold-base/20"
								onClick={() => {
									if (shareUrl && typeof window !== "undefined") {
										window.open(shareUrl, "_blank", "noopener,noreferrer");
									}
								}}
							>
								<ExternalLink aria-hidden="true" size={15} strokeWidth={2} />
								Mở link rút
							</button>
						</div>
					) : null}

					{pendingLinkSessions.length > 0 ? (
						<div className="grid gap-2 rounded-xl border border-gold-base/20 bg-black-ink/35 p-3">
							<div className="flex items-center justify-between gap-3">
								<p className="font-vn text-[11px] font-bold uppercase tracking-[0.18em] text-gold-base/70">
									Link đang chờ
								</p>
								<span className="rounded-full border border-gold-base/20 px-2 py-0.5 font-mono text-[10px] text-gold-shine/55">
									{pendingLinkSessions.length}
								</span>
							</div>
							<div className="grid max-h-40 gap-2 overflow-auto pr-1">
								{pendingLinkSessions.map((session) => {
									const url = buildShareUrl(session.sharePath);
									const isCancelling = cancellingSessionId === session.id;
									return (
										<div
											key={session.id}
											className="grid gap-2 rounded-lg border border-gold-base/15 bg-black-ink/45 p-2"
										>
											<div className="min-w-0">
												<p className="truncate font-vn text-sm font-bold text-gold-shine/80">
													{session.guestNameDisplay}
												</p>
												<p className="truncate font-vn text-[11px] text-gold-shine/45">
													{session.campaignName ?? "Chiến dịch hiện tại"}
												</p>
												<p className="truncate font-vn text-[11px] text-gold-shine/35">
													Hết hạn {formatExpiry(session.expiresAt)}
												</p>
											</div>
											<div className="grid grid-cols-3 gap-2">
												<button
													type="button"
													className="inline-flex items-center justify-center gap-1 rounded-full border border-gold-base/25 px-2 py-1.5 font-vn text-[11px] font-bold text-gold-base transition-colors hover:bg-gold-base/10"
													onClick={() => {
														void navigator.clipboard?.writeText(url);
													}}
												>
													<Clipboard aria-hidden="true" size={11} strokeWidth={2} />
													Copy
												</button>
												<button
													type="button"
													className="inline-flex items-center justify-center gap-1 rounded-full border border-gold-base/25 px-2 py-1.5 font-vn text-[11px] font-bold text-gold-shine/75 transition-colors hover:bg-gold-base/10"
													onClick={() => {
														if (typeof window !== "undefined") {
															window.open(url, "_blank", "noopener,noreferrer");
														}
													}}
												>
													<Link aria-hidden="true" size={11} strokeWidth={2} />
													Mở
												</button>
												<button
													type="button"
													className="inline-flex items-center justify-center gap-1 rounded-full border border-red-vivid/35 px-2 py-1.5 font-vn text-[11px] font-bold text-red-vivid transition-colors hover:bg-red-deep/25 disabled:cursor-not-allowed disabled:opacity-50"
													disabled={Boolean(cancellingSessionId)}
													onClick={() => onCancelLinkSession(session.id)}
												>
													{isCancelling ? null : (
														<XCircle aria-hidden="true" size={11} strokeWidth={2} />
													)}
													{isCancelling ? "..." : "Hủy"}
												</button>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					) : null}

					<div className="grid gap-2">
						<div className="flex items-center justify-between">
							<label
								className="block font-vn text-[11px] font-bold tracking-[0.2em] uppercase text-gold-shine/40 pl-1"
								htmlFor="guest-name"
							>
								Tên người rút
							</label>
							{hasGuestNameError && (
								<span className="text-[10px] text-red-vivid/70 font-vn italic">
									Tối thiểu 2 ký tự
								</span>
							)}
						</div>
				<div className="relative group/input">
					<input
						id="guest-name"
						className={`block h-[52px] w-full rounded-xl border px-5 text-lg text-gold-shine placeholder:text-gold-shine/20 shadow-inner outline-none transition-all ${
							hasGuestNameError
								? "border-red-vivid/50 bg-red-deep/30 focus:border-red-vivid/70 focus:ring-1 focus:ring-red-vivid/40"
								: guestName.length >= 2
									? "border-gold-base/55 bg-gold-base/12 focus:border-gold-base/80 focus:ring-1 focus:ring-gold-base/35"
									: "border-gold-base/30 bg-[rgba(10,0,0,0.5)] focus:border-gold-base/70 focus:ring-1 focus:ring-gold-base/40 focus:bg-[rgba(20,0,0,0.6)]"
						}`}
						value={guestName}
						onChange={(event) =>
							onGuestNameChange(event.currentTarget.value)
						}
						placeholder="vd: Nguyen Van A"
					/>
							{guestName.length >= 2 && (
								<div className="absolute right-4 top-1/2 -translate-y-1/2 text-gold-base drop-shadow-[0_0_8px_rgba(212,175,55,0.35)]">
									<Check aria-hidden="true" size={20} strokeWidth={3} />
								</div>
							)}
						</div>
					</div>

					<div className="grid gap-2">
						<label
							htmlFor="otp-pin"
							className="block font-vn text-[11px] font-bold tracking-[0.2em] uppercase text-gold-shine/40 pl-1"
						>
							PIN host
						</label>
						<div className="flex justify-center">
							<OtpPinInput
								value={hostPin}
								onChange={onHostPinChange}
								length={pinLength}
								disabled={loading}
							/>
						</div>
					</div>

					<button
						type="button"
						className={`relative mt-2 w-full overflow-hidden rounded-full border px-6 py-4 font-cinzel text-lg font-bold tracking-[0.05em] shadow-lg transition-all duration-300 ${
							loading
								? "border-gold-base/40 bg-gold-base/10 text-gold-base/60 cursor-not-allowed"
								: canSubmit
									? "border-gold-base/50 bg-linear-to-b from-gold-base/15 to-red-deep/60 text-gold-shine hover:-translate-y-0.5 hover:border-gold-base/80 hover:shadow-[0_0_40px_rgba(212,175,55,0.3)] active:translate-y-0 active:scale-95"
									: "border-gold-base/30 bg-[rgba(10,0,0,0.5)] text-gold-base/40 cursor-not-allowed"
						}`}
						disabled={!canSubmit}
						onClick={onCreate}
						aria-label={loading ? "Đang khởi tạo lượt rút" : "Tạo lượt rút mới"}
					>
						{loading && (
							<div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
								<div className="h-5 w-5 animate-spin rounded-full border-2 border-gold-base/30 border-t-gold-base" />
							</div>
						)}
						<span className={`relative z-10 drop-shadow-md ${loading ? "opacity-0" : ""}`}>
							{loading ? "Đang khởi tạo..." : "TẠO PHIÊN RÚT"}
						</span>
					</button>
				</div>
			</div>
		</div>
	);
}
