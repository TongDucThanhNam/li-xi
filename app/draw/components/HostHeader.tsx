import type { ReactNode } from "react";

type HostHeaderProps = {
	ownerUsername: string;
	onCampaigns?: () => void;
	onDraw?: () => void;
	onSetup: () => void;
	onLeaderboard: () => void;
	onLogout: () => void;
};

export default function HostHeader({
	ownerUsername,
	onCampaigns,
	onDraw,
	onSetup,
	onLeaderboard,
	onLogout,
}: HostHeaderProps) {
	return (
		<header className="relative flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-gold-base/40 bg-[rgba(20,0,0,0.75)] px-4 py-2 shadow-2xl backdrop-blur-xl sm:flex-nowrap hover:border-gold-base/60 hover:shadow-[0_20px_40px_rgba(212,175,55,0.15)] transition-all duration-300">
			{/* Inner Stroke - Design System Requirement */}
			<div className="pointer-events-none absolute inset-[3px] rounded-[21px] border border-gold-base/10" />

			<div className="relative flex items-center gap-4">
				<div className="relative h-14 w-14 overflow-hidden rounded-full border border-gold-base/70 bg-linear-to-br from-gold-base/25 to-red-deep/45 shadow-[0_4px_20px_rgba(0,0,0,0.3),inset_0_0_20px_rgba(212,175,55,0.1)] flex items-center justify-center group">
					<span className="font-cinzel text-2xl text-gold-shine drop-shadow-sm select-none">
						H
					</span>
					{/* Status Indicator */}
					<div className="absolute right-0.5 bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-black-ink bg-gold-base shadow-[0_0_8px_rgba(212,175,55,0.6)] animate-pulse" />
					<div className="absolute inset-0 bg-gold-shine/5 opacity-0 transition-opacity group-hover:opacity-100" />
				</div>

				<div className="flex flex-col">
					<h1 className="font-cinzel text-xl leading-none tracking-[0.05em] text-transparent bg-linear-to-b from-gold-shine via-gold-shine to-gold-base bg-clip-text drop-shadow-[0_2px_8px_rgba(212,175,55,0.4)] lg:text-2xl select-none">
						HOST STATION
					</h1>
					<p className="mt-1 font-vn text-[12px] italic text-gold-shine/70 tracking-wide lg:text-[13px]">
						Host chiến dịch:{" "}
						<span className="font-bold text-gold-shine">{ownerUsername}</span>
					</p>
				</div>
			</div>

			<nav className="relative flex flex-wrap items-center gap-1 sm:gap-2">
				{onCampaigns ? (
					<>
						<HeaderButton onClick={onCampaigns} icon={<SparkIcon />} ariaLabel="Quản lý chiến dịch">
							Chiến dịch
						</HeaderButton>
						<div className="hidden h-5 w-px bg-gold-base/20 sm:block" />
					</>
				) : null}

				{onDraw ? (
					<>
						<HeaderButton onClick={onDraw} icon={<TicketIcon />} ariaLabel="Mở trạm rút thưởng">
							Trạm rút
						</HeaderButton>
						<div className="hidden h-5 w-px bg-gold-base/20 sm:block" />
					</>
				) : null}

				<HeaderButton onClick={onSetup} icon={<SettingsIcon />} ariaLabel="Cấu hình hệ thống">
					Cấu hình
				</HeaderButton>

				<div className="hidden h-5 w-px bg-gold-base/20 sm:block" />

				<HeaderButton onClick={onLeaderboard} icon={<TrophyIcon />} ariaLabel="Xem bảng xếp hạng">
					Xếp hạng
				</HeaderButton>

				<div className="hidden h-5 w-px bg-gold-base/20 sm:block" />

				<button
					type="button"
					aria-label="Đăng xuất khỏi hệ thống"
					className="group relative flex items-center gap-2 rounded-xl border border-red-vivid/40 bg-red-deep/30 px-5 py-2.5 font-playfair text-sm font-bold text-red-vivid/90 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-red-vivid/70 hover:bg-red-vivid/20 hover:text-white hover:shadow-[0_4px_12px_rgba(179,20,20,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-vivid/50 active:scale-95"
					onClick={onLogout}
				>
					{/* Button glow effect */}
					<div className="absolute inset-0 rounded-xl bg-red-vivid/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
					<span className="relative transition-transform duration-300 group-hover:scale-110">
						<LogoutIcon />
					</span>
					<span className="relative z-10">Đăng xuất</span>
				</button>
			</nav>
		</header>
	);
}

function SparkIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" />
		</svg>
	);
}

function TicketIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M2 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
			<path d="M13 5v2" />
			<path d="M13 17v2" />
			<path d="M13 11v2" />
		</svg>
	);
}

function HeaderButton({
	children,
	onClick,
	icon,
	ariaLabel,
}: { children: ReactNode; onClick: () => void; icon: ReactNode; ariaLabel?: string }) {
	return (
		<button
			type="button"
			aria-label={ariaLabel}
			className="group relative flex items-center gap-2 rounded-xl border border-transparent px-4 py-2.5 font-playfair text-sm font-bold text-gold-shine/70 transition-all duration-300 hover:bg-gold-base/10 hover:text-gold-shine hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-base/30 active:scale-95"
			onClick={onClick}
		>
			{/* Hover glow effect */}
			<div className="absolute inset-0 rounded-xl bg-gold-base/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
			<span className="relative opacity-60 transition-all duration-300 group-hover:scale-110 group-hover:opacity-100 group-hover:drop-shadow-[0_0_8px_rgba(212,175,55,0.3)]">
				{icon}
			</span>
			<span className="relative z-10">{children}</span>
		</button>
	);
}

function SettingsIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	);
}

function TrophyIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
			<path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
			<path d="M4 22h16" />
			<path d="M10 22V18" />
			<path d="M14 22V18" />
			<path d="M18 4H6v7a6 6 0 0 0 12 0V4Z" />
		</svg>
	);
}

function LogoutIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
			<polyline points="16 17 21 12 16 7" />
			<line x1="21" y1="12" x2="9" y2="12" />
		</svg>
	);
}
