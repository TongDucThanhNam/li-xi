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

	return (
		<div className="relative rounded-2xl border border-gold-base/30 bg-linear-to-br from-[#120101] to-[#3e0000] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all h-full flex flex-col justify-center">
			{/* Inner Border */}
			<div className="absolute inset-[3px] rounded-[13px] border border-gold-base/10 pointer-events-none" />

			<div className="relative z-10 max-w-md mx-auto w-full">
				<h2 className="font-playfair text-[32px] leading-tight tracking-[0.01em] text-transparent bg-linear-to-b from-gold-shine via-gold-shine to-gold-base bg-clip-text drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] mb-6 text-center">
					Tạo lượt rút mới
				</h2>

				<div className="grid gap-6">
					<div className="grid gap-2">
						<label
							className="block font-vn text-[11px] font-bold tracking-[0.2em] uppercase text-gold-shine/40 pl-1"
							htmlFor="guest-name"
						>
							Tên người rút
						</label>
						<div className="relative group/input">
							<input
								id="guest-name"
								className="block h-[52px] w-full rounded-xl border border-gold-base/20 bg-black-ink/40 px-5 text-lg text-gold-shine placeholder:text-gold-shine/10 shadow-inner outline-none transition-all focus:border-gold-base/60 focus:bg-black-ink/60"
								value={guestName}
								onChange={(event) =>
									onGuestNameChange(event.currentTarget.value)
								}
								placeholder="vd: Nguyen Van A"
							/>
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
						className="relative mt-2 w-full overflow-hidden rounded-full border border-gold-base/40 bg-linear-to-b from-gold-base/10 to-red-deep/60 px-6 py-4 font-cinzel text-lg font-bold tracking-[0.05em] text-gold-shine shadow-lg transition-all hover:-translate-y-0.5 hover:border-gold-base/70 hover:shadow-red-deep/20 active:translate-y-0 active:scale-95 disabled:opacity-30 disabled:hover:translate-y-0"
						disabled={!canSubmit}
						onClick={onCreate}
					>
						<span className="relative z-10 drop-shadow-md">
							{loading ? "Đang khởi tạo..." : "TẠO PHIÊN RÚT"}
						</span>
					</button>
				</div>
			</div>
		</div>
	);
}
