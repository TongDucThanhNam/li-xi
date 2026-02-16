import type { ReactNode } from "react";

type FancyButtonVariant = "primary" | "secondary" | "header";

type FancyButtonProps = {
	variant: FancyButtonVariant;
	children: ReactNode;
	onClick?: () => void;
	disabled?: boolean;
	type?: "button" | "submit" | "reset";
	className?: string;
};

const variantClassNames: Record<FancyButtonVariant, string> = {
	primary:
		"relative w-full rounded-full border border-[rgba(212,175,55,0.5)] bg-[radial-gradient(circle_at_20%_20%,_rgba(255,229,170,0.16),_transparent_55%),linear-gradient(rgba(40,0,0,0.6),rgba(40,0,0,0.6))] py-3 font-[var(--font-playfair)] font-semibold tracking-[0.8px] text-[#f6d895] shadow-[0_12px_24px_rgba(10,2,2,0.45)] transition hover:-translate-y-[2px] hover:border-[rgba(255,225,142,0.9)] hover:bg-[rgba(80,0,0,0.8)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50",
	secondary:
		"relative w-full rounded-full border border-[rgba(212,175,55,0.35)] bg-[rgba(40,0,0,0.4)] py-3 font-[var(--font-playfair)] tracking-[0.6px] text-[rgba(255,232,192,0.8)] transition hover:-translate-y-[2px] hover:border-[rgba(255,225,142,0.9)] hover:bg-[rgba(80,0,0,0.8)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50",
	header:
		"rounded-full border border-[rgba(212,175,55,0.45)] bg-[rgba(40,0,0,0.6)] px-4 py-2 font-[var(--font-playfair)] text-[13px] tracking-[0.6px] text-[#f8dea0] shadow-[0_10px_18px_rgba(10,2,2,0.35)] transition hover:-translate-y-[1px] hover:border-[rgba(255,225,142,0.9)] hover:bg-[rgba(80,0,0,0.8)] hover:shadow-[0_10px_26px_rgba(34,5,5,0.5)]",
};

export default function FancyButton({
	variant,
	children,
	onClick,
	disabled = false,
	type = "button",
	className,
}: FancyButtonProps) {
	const resolvedClassName = className
		? `${variantClassNames[variant]} ${className}`
		: variantClassNames[variant];

	return (
		<button
			type={type}
			className={resolvedClassName}
			onClick={onClick}
			disabled={disabled}
		>
			{children}
		</button>
	);
}
