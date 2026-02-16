type HostHeaderProps = {
	ownerUsername: string;
	onSetup: () => void;
	onLeaderboard: () => void;
	onLogout: () => void;
};

export default function HostHeader({
	ownerUsername,
	onSetup,
	onLeaderboard,
	onLogout,
}: HostHeaderProps) {
	return (
		<header className="relative flex flex-wrap items-center justify-between gap-6 rounded-full border border-[rgba(212,175,55,0.25)] bg-[rgba(20,5,5,0.85)] shadow-[0_4px_30px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all px-2 py-2">
			<div className="flex items-center gap-4">
				<div className="h-12 w-12 rounded-full border border-[rgba(212,175,55,0.6)] bg-linear-to-br from-[rgba(212,175,55,0.2)] to-[rgba(94,10,10,0.4)] shadow-[inset_0_0_12px_rgba(212,175,55,0.3)] flex items-center justify-center">
					<span className="font-cinzel text-2xl text-gold-shine">H</span>
				</div>
				<div>
					<h1 className="font-cinzel text-[24px] tracking-[0.05em] text-transparent bg-[linear-gradient(180deg,#fff8dc,#d4af37)] bg-clip-text drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-none">
						HOST STATION
					</h1>
					<p className="mt-1 font-vn text-[13px] italic text-[rgba(255,248,220,0.7)] tracking-wide">
						Chủ ví: <span className="text-gold-shine">{ownerUsername}</span>
					</p>
				</div>
			</div>

			<div className="flex items-center gap-2">
				<button
					type="button"
					className="group relative overflow-hidden rounded-full border border-transparent bg-transparent px-5 py-2 font-playfair text-[14px] font-bold text-[rgba(255,248,220,0.8)] transition-all hover:bg-[rgba(212,175,55,0.1)] hover:text-gold-shine focus-visible:outline-none"
					onClick={onSetup}
				>
					<span className="relative z-10">Cấu hình</span>
				</button>
				<div className="h-4 w-px bg-[rgba(212,175,55,0.3)]" />
				<button
					type="button"
					className="group relative overflow-hidden rounded-full border border-transparent bg-transparent px-5 py-2 font-playfair text-[14px] font-bold text-[rgba(255,248,220,0.8)] transition-all hover:bg-[rgba(212,175,55,0.1)] hover:text-gold-shine focus-visible:outline-none"
					onClick={onLeaderboard}
				>
					<span className="relative z-10">Xếp hạng</span>
				</button>
				<div className="h-4 w-px bg-[rgba(212,175,55,0.3)]" />
				<button
					type="button"
					className="group relative overflow-hidden rounded-full border border-[rgba(179,20,20,0.4)] bg-[rgba(94,10,10,0.4)] px-6 py-2 font-playfair text-[14px] font-bold text-[rgba(255,160,160,0.9)] shadow-[0_2px_10px_rgba(0,0,0,0.3)] transition-all hover:-translate-y-px hover:border-[rgba(255,80,80,0.6)] hover:bg-[rgba(179,20,20,0.6)] hover:text-white hover:shadow-[0_4px_16px_rgba(179,20,20,0.4)] focus-visible:outline-none"
					onClick={onLogout}
				>
					<span className="relative z-10">Đăng xuất</span>
				</button>
			</div>
		</header>
	);
}
