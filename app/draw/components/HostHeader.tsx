import type { ReactNode } from "react";
import {
	LogOut,
	Settings2,
	Sparkles,
	Ticket,
	Trophy,
} from "lucide-react";

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
		<header className="relative flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gold-base/35 bg-[rgba(20,0,0,0.76)] px-4 py-3 shadow-[0_14px_34px_rgba(0,0,0,0.32)] backdrop-blur-xl transition-colors sm:flex-nowrap hover:border-gold-base/55">
			<div className="pointer-events-none absolute inset-[3px] rounded-[13px] border border-gold-base/10" />

			<div className="relative flex items-center gap-4">
				<div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-gold-base/55 bg-linear-to-br from-gold-base/20 to-red-deep/45 shadow-[0_4px_16px_rgba(0,0,0,0.28),inset_0_0_20px_rgba(212,175,55,0.08)]">
					<span className="font-cinzel text-2xl text-gold-shine drop-shadow-sm select-none">
						H
					</span>
					<div className="absolute right-1.5 bottom-1.5 h-2.5 w-2.5 rounded-full border border-black-ink bg-gold-base" />
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
					className="relative flex items-center gap-2 rounded-xl border border-red-vivid/35 bg-red-deep/25 px-4 py-2.5 font-playfair text-sm font-bold text-red-vivid/90 transition-colors hover:border-red-vivid/60 hover:bg-red-vivid/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-vivid/45 active:scale-[0.98]"
					onClick={onLogout}
				>
					<LogoutIcon />
					<span className="relative z-10">Đăng xuất</span>
				</button>
			</nav>
		</header>
	);
}

function SparkIcon() {
	return <Sparkles aria-hidden="true" size={18} strokeWidth={2} />;
}

function TicketIcon() {
	return <Ticket aria-hidden="true" size={18} strokeWidth={2} />;
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
			className="relative flex items-center gap-2 rounded-xl border border-transparent px-3.5 py-2.5 font-playfair text-sm font-bold text-gold-shine/70 transition-colors hover:bg-gold-base/10 hover:text-gold-shine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-base/30 active:scale-[0.98]"
			onClick={onClick}
		>
			<span className="relative opacity-70">
				{icon}
			</span>
			<span className="relative z-10">{children}</span>
		</button>
	);
}

function SettingsIcon() {
	return <Settings2 aria-hidden="true" size={18} strokeWidth={2} />;
}

function TrophyIcon() {
	return <Trophy aria-hidden="true" size={18} strokeWidth={2} />;
}

function LogoutIcon() {
	return <LogOut aria-hidden="true" size={18} strokeWidth={2} />;
}
