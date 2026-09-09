import { createFileRoute } from "@tanstack/react-router";
import { AuthFeature } from "./-auth/AuthFeature";
import { StandaloneAdminRouteError } from "./-auth/StandaloneAdminRouteError";
import adminCss from "./styles/admin.css?url";

export const Route = createFileRoute("/auth")({
	head: () => ({
		links: [{ rel: "stylesheet", href: adminCss }],
		meta: [
			{ title: "Đăng nhập | Campaign Game Studio" },
			{
				name: "description",
				content: "Đăng nhập Google để mở không gian vận hành chiến dịch trò chơi.",
			},
		],
	}),
	errorComponent: StandaloneAdminRouteError,
	component: AuthFeature,
});
