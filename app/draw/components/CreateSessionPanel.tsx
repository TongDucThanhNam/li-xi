import OtpPinInput from "@/app/components/OtpPinInput";

type CreateSessionPanelProps = {
	guestName: string;
	hostPin: string;
	pinLength: number;
	loading: boolean;
	onGuestNameChange: (value: string) => void;
	onHostPinChange: (value: string) => void;
	onCreate: () => void;
};

export default function CreateSessionPanel({
	guestName,
	hostPin,
	pinLength,
	loading,
	onGuestNameChange,
	onHostPinChange,
	onCreate,
}: CreateSessionPanelProps) {
	const canSubmit =
		!loading && guestName.trim().length >= 2 && hostPin.length === pinLength;
	const hasGuestNameError = guestName.length > 0 && guestName.trim().length < 2;

	return (
		<div className="relative rounded-2xl border border-gold-base/40 bg-linear-to-br from-[#1a0a0a] to-[#4a0a0a] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.4)] backdrop-blur-md transition-all h-full flex flex-col justify-center hover:border-gold-base/60 hover:shadow-[0_20px_50px_rgba(212,175,55,0.15)]">
			{/* Inner Border */}
			<div className="absolute inset-[3px] rounded-[13px] border border-gold-base/10 pointer-events-none" />

			{/* Ambient glow behind panel */}
			<div className="absolute inset-0 rounded-2xl bg-gold-base/10 blur-2xl opacity-0 transition-opacity duration-700 group-hover:opacity-100 pointer-events-none" />

			<div className="relative z-10 max-w-md mx-auto w-full">
				<div className="text-center mb-6">
					<div className="inline-block mb-3 p-2 rounded-full bg-gold-base/10">
						<svg className="w-5 h-5 text-gold-base" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Icon tạo lượt rút">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
						</svg>
					</div>
					<h2 className="font-playfair text-[32px] leading-tight tracking-[0.01em] text-transparent bg-linear-to-b from-gold-shine via-gold-shine to-gold-base bg-clip-text drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
						Tạo lượt rút mới
					</h2>
				</div>

				<div className="grid gap-5">
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
									? "border-emerald-500/50 bg-emerald-500/15 focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/40"
									: "border-gold-base/30 bg-[rgba(10,0,0,0.5)] focus:border-gold-base/70 focus:ring-1 focus:ring-gold-base/40 focus:bg-[rgba(20,0,0,0.6)]"
						}`}
						value={guestName}
						onChange={(event) =>
							onGuestNameChange(event.currentTarget.value)
						}
						placeholder="vd: Nguyen Van A"
					/>
							{guestName.length >= 2 && (
								<div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500">
									<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
									</svg>
								</div>
							)}
						</div>
					</div>

					<div className="grid gap-2">
						<label
							htmlFor="otp-pin"
							className="block font-vn text-[11px] font-bold tracking-[0.2em] uppercase text-gold-shine/40 pl-1"
						>
							PIN chủ ví
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
