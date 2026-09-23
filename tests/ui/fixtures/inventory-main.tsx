// Repo-owned UI fixture entry: mounts the ACTUAL RewardInventoryPanel with
// real admin CSS/Tailwind and the synthetic convex/react replacement. The
// programmatic fixture API lives on window.__inventoryFixture for Playwright;
// there is no visible debug overlay and no production code path is involved.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { RewardInventoryPanel } from "../../../app/_workspace/-features/RewardInventoryPanel";
import type { Id } from "../../../convex/_generated/dataModel";
import { CAMPAIGN_A, fixtureApi } from "./convex-mock";
import "./styles.css";

function InventoryPage() {
	const [campaignId, setCampaignId] = useState<string>(CAMPAIGN_A);
	useEffect(() => {
		fixtureApi.__registerCampaignSetter(setCampaignId);
	}, []);
	return (
		<main
			data-testid="inventory-root"
			style={{ margin: "0 auto", maxWidth: 1100, padding: 16 }}
		>
			<p data-testid="inventory-campaign">Inventory campaign: {campaignId}</p>
			<RewardInventoryPanel campaignId={campaignId as Id<"campaigns">} />
		</main>
	);
}

createRoot(document.getElementById("root")!).render(<InventoryPage />);
