export function OrnamentDivider({ className = "" }: { className?: string }) {
	return (
		<div
			className={`flex items-center justify-center gap-3 select-none ${className}`}
			aria-hidden="true"
		>
			<span className="block h-px w-10 sm:w-16 bg-linear-to-r from-transparent to-gold-base/40" />
			<span className="text-gold-base/60 text-xs">✦</span>
			<span className="block h-px w-10 sm:w-16 bg-linear-to-l from-transparent to-gold-base/40" />
		</div>
	);
}
