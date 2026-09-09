import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsSettingsFeature } from "../-features/IntegrationsSettingsFeature";

export const Route = createFileRoute("/_workspace/settings/integrations")({
	head: () => ({
		meta: [
			{ title: "Tích hợp | Campaign Game Studio" },
			{
				name: "description",
				content: "Kiểm tra trạng thái Google OAuth, R2, Polar và cấu hình vận hành.",
			},
		],
	}),
	component: IntegrationsSettingsFeature,
});
