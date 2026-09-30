import { createFileRoute } from "@tanstack/react-router";
import { GameRouteError } from "@/app/game-templates/GameRouteError";
import {
	stationCssLayers,
	stationShellCssHref,
} from "@/app/game-templates/registry";
import { requireHostRouteAuth } from "@/lib/hostRouteGuard";
import { StationPlayFeature } from "./-features/StationPlayFeature";

export const Route = createFileRoute("/station/$campaignGameId")({
	beforeLoad: requireHostRouteAuth,
	/**
	 * The shell chrome layer plus every station-capable template layer in a
	 * fixed documented order (see stationCssLayers). Per-game resolution in
	 * head() cannot be SSR-safe on this route: the owner-authenticated
	 * template id only exists behind the host's Convex Auth browser session,
	 * so a loader-resolved head would miss the stylesheet on first paint.
	 * The fixed set is collision-free (isolated class prefixes) and keeps
	 * the guest stage styled under SSR, client navigation, and reloads.
	 */
	head: () => ({
		links: [
			{ rel: "stylesheet", href: stationShellCssHref },
			...stationCssLayers().flatMap((template) => [
				{ rel: "stylesheet", href: template.cssHref },
				...template.fonts,
			]),
		],
		meta: [
			{ title: "Trạm chơi | Campaign Game Studio" },
			{
				name: "description",
				content: "Trải nghiệm trò chơi toàn màn hình dành cho người tham gia tại trạm.",
			},
		],
	}),
	errorComponent: StationRouteError,
	component: StationRoute,
});

function StationRouteError(props: { error: Error; reset: () => void }) {
	return <GameRouteError {...props} showWorkspaceLink />;
}

function StationRoute() {
	const { campaignGameId } = Route.useParams();
	return <StationPlayFeature key={campaignGameId} campaignGameId={campaignGameId} />;
}
