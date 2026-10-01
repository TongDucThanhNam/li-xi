import { Link } from "@tanstack/react-router";

const settingsNavigation = [
	["Thanh toán", "/settings/billing"],
	["Tích hợp", "/settings/integrations"],
	["Vận hành", "/settings/operations"],
] as const;

export function SettingsContextNav() {
	return (
		<nav aria-label="Điều hướng cài đặt" className="admin-tabs">
			{settingsNavigation.map(([label, to]) => (
				<Link
					activeProps={{ "aria-current": "page" }}
					className="admin-tabs__link"
					key={to}
					to={to}
				>
					{label}
				</Link>
			))}
		</nav>
	);
}
