import { Link } from "@tanstack/react-router";

const settingsNavigation = [
	["Thanh toán", "/settings/billing"],
	["Tích hợp", "/settings/integrations"],
	["Vận hành", "/settings/operations"],
] as const;

export function SettingsContextNav() {
	return (
		<nav aria-label="Điều hướng cài đặt" className="mb-6 flex gap-2 overflow-x-auto">
			{settingsNavigation.map(([label, to]) => (
				<Link
					activeProps={{ "aria-current": "page", className: "bg-surface-secondary" }}
					className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-foreground"
					key={to}
					to={to}
				>
					{label}
				</Link>
			))}
		</nav>
	);
}
