import { configRewardMode, configRewardSource, type CampaignGameConfig } from "./gameTemplates";

/**
 * Shared reward-setup readiness for a campaign's games (workspace UX redesign
 * §7.1): which reward sources the rewarded games draw from and whether both
 * are satisfied. Pure so the campaign overview checklist and the rewards page
 * always agree.
 */
export function rewardReadiness(
	games: Array<{ config: CampaignGameConfig }>,
	state: { hasBudget: boolean; inventoryCount: number },
) {
	const rewarded = games.filter((game) => configRewardMode(game.config) === "rewarded");
	const needsBudget = rewarded.some((game) => configRewardSource(game.config) === "campaign-budget");
	const needsInventory = rewarded.some((game) => configRewardSource(game.config) === "campaign-inventory");
	const missingBudget = needsBudget && !state.hasBudget;
	const missingInventory = needsInventory && state.inventoryCount === 0;
	return {
		needsBudget,
		needsInventory,
		missingBudget,
		missingInventory,
		ready: !missingBudget && !missingInventory,
	};
}
