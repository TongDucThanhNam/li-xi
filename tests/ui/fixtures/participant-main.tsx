// Repo-owned participant fixture entry: mounts the ACTUAL
// PublicShareEntryFeature (which in turn mounts the actual registry stages)
// with the real template CSS layers and the synthetic publicPlay
// convex/react replacement. Programmatic controls live on
// window.__participantFixture; there is no visible debug overlay.
import React from "react";
import { createRoot } from "react-dom/client";
import { PublicShareEntryFeature } from "../../../app/play/-features/PublicShareEntryFeature";
import {
	participantFixtureApi,
	resolveParticipantShareCode,
} from "./participant-convex-mock";

// Template stylesheets load in real /p route order: li-xi first, then the
// wheel, scratch, and slot layers (mirrors app/p/$shareCode.tsx head links).
import "../../../app/styles/draw.css";
import "../../../app/styles/lucky-wheel.css";
import "../../../app/styles/scratch-card.css";
import "../../../app/styles/slot-reveal.css";

const shareCode = resolveParticipantShareCode(
	new URLSearchParams(window.location.search).get("share") ?? "wheel",
);
participantFixtureApi.setActiveShareCode(shareCode);

function ParticipantPage() {
	return (
		<main data-testid="participant-root">
			<PublicShareEntryFeature key={shareCode} shareCode={shareCode} />
		</main>
	);
}

createRoot(document.getElementById("root")!).render(<ParticipantPage />);
