import { describe, expect, test } from "vitest";
import {
	gameTemplates,
	type CampaignGameConfig,
} from "./gameTemplates";
import { rewardReadiness } from "./rewardReadiness";

const budgetGame: { config: CampaignGameConfig } = {
	config: gameTemplates["li-xi"].initialCampaignConfig,
};
const inventoryGame: { config: CampaignGameConfig } = {
	config: gameTemplates["lucky-wheel"].initialCampaignConfig,
};
const engagementGame: { config: CampaignGameConfig } = {
	config: { ...gameTemplates["lucky-wheel"].defaultConfig, rewardMode: "engagement" },
};

describe("rewardReadiness", () => {
	test("no rewarded game → ready regardless of budget or inventory", () => {
		expect(rewardReadiness([], { hasBudget: false, inventoryCount: 0 }).ready).toBe(true);
		expect(
			rewardReadiness([engagementGame], { hasBudget: false, inventoryCount: 0 }).ready,
		).toBe(true);
	});

	test("budget game without budget setup → not ready, budget missing", () => {
		const result = rewardReadiness([budgetGame], { hasBudget: false, inventoryCount: 0 });
		expect(result.ready).toBe(false);
		expect(result.missingBudget).toBe(true);
		expect(result.needsBudget).toBe(true);
	});

	test("inventory game with zero items → not ready, inventory missing", () => {
		const result = rewardReadiness([inventoryGame], { hasBudget: true, inventoryCount: 0 });
		expect(result.ready).toBe(false);
		expect(result.missingInventory).toBe(true);
		expect(result.needsInventory).toBe(true);
	});

	test("both sources satisfied → ready", () => {
		expect(
			rewardReadiness([budgetGame, inventoryGame], { hasBudget: true, inventoryCount: 3 }).ready,
		).toBe(true);
	});
});
