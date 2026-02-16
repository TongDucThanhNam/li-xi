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
		<div className="relative rounded-3xl border border-[rgba(212,175,55,0.46)] bg-linear-to-br from-[rgba(18,2,2,0.95)] to-[rgba(56,1,1,0.9)] p-8! shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-sm group h-full flex flex-col justify-center">
			{/* Inner Border */}
			<div className="absolute inset-[4px] rounded-[20px] border border-[rgba(212,175,55,0.15)] pointer-events-none" />

			{/* Decorative Icon */}
			<div className="absolute top-6 right-6 opacity-20 text-gold-shine animate-pulse-slow">
				<svg
					width="64"
					height="64"
					viewBox="0 0 24 24"
					fill="currentColor"
					aria-hidden="true"
				>
					<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 16L12 15.45 7.77 18l1.12-4.81-3.73-3.23 4.92-.42L12 5l1.92 4.53 4.92.42-3.73 3.23 1.12 4.81z" />
				</svg>
			</div>

			<div className="relative z-10 max-w-lg mx-auto w-full">
				<h2 className="font-playfair text-[clamp(32px,3.5vw,48px)] leading-[1.12] tracking-[0.01em] text-transparent bg-[linear-gradient(180deg,#fff8dc,#d4af37)] bg-clip-text drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] mb-2 text-center">
					Tạo lượt rút mới
				</h2>
				<p className="font-vn text-[15px] text-[rgba(255,248,220,0.6)] text-center mb-10 tracking-wide">
					Nhập thông tin người chơi may mắn tiếp theo
				</p>

				<div className="grid gap-8">
					<div className="grid gap-3">
						<label
							className="block font-vn text-[13px] font-bold tracking-widest uppercase text-[rgba(255,241,203,0.7)] pl-1"
							htmlFor="guest-name"
						>
							Tên người rút
						</label>
						<div className="relative group/input">
							<input
								id="guest-name"
								className="block h-[64px] w-full rounded-2xl border border-[rgba(212,175,55,0.3)] bg-[rgba(0,0,0,0.4)] px-6 text-xl text-gold-shine placeholder:text-[rgba(255,241,203,0.2)] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] outline-none transition-all duration-300 focus:border-gold-shine focus:bg-[rgba(0,0,0,0.6)] focus:shadow-[0_0_0_4px_rgba(212,175,55,0.15)]"
								value={guestName}
								onChange={(event) =>
									onGuestNameChange(event.currentTarget.value)
								}
								placeholder="vd: Nguyen Van A"
							/>
							<div className="absolute inset-0 rounded-2xl bg-linear-to-r from-transparent via-[rgba(255,248,220,0.1)] to-transparent opacity-0 transition-opacity duration-500 pointer-events-none group-hover/input:opacity-100" />
						</div>
					</div>

					<div className="grid gap-3">
						<label
							htmlFor="otp-pin"
							className="block font-vn text-[13px] font-bold tracking-widest uppercase text-[rgba(255,241,203,0.7)] pl-1"
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
						className="relative mt-4 w-full overflow-hidden rounded-full border border-[rgba(212,175,55,0.5)] bg-linear-to-b from-[rgba(212,175,55,0.2)] to-[rgba(179,20,20,0.8)] px-6 py-5 font-cinzel text-[22px] font-bold tracking-[0.05em] text-gold-shine shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all duration-300 hover:-translate-y-1 hover:border-[rgba(255,248,220,0.8)] hover:shadow-[0_15px_40px_rgba(179,20,20,0.4)] hover:brightness-110 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
						disabled={!canSubmit}
						onClick={onCreate}
					>
						<span className="relative z-10 drop-shadow-md">
							{loading ? "Đang khởi tạo..." : "TẠO PHIÊN RÚT"}
						</span>
						{/* Glow effect */}
						<div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(255,215,0,0.4),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
					</button>
				</div>
			</div>
		</div>
	);
}
