import { createFileRoute } from "@tanstack/react-router";
import { OperationsSettingsFeature } from "../-features/OperationsSettingsFeature";

export const Route = createFileRoute("/_workspace/settings/operations")({
	head: () => ({
		meta: [
			{ title: "Vận hành | Campaign Game Studio" },
			{
				name: "description",
				content: "Thiết lập Host PIN và các bảo vệ dành cho thao tác tại trạm.",
			},
		],
	}),
	component: OperationsSettingsFeature,
});
