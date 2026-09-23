// Repo-owned test fixture: synthetic convex/react for the ACTUAL
// RewardInventoryPanel. Test controls may change mock data and response
// timing only — never the product behavior under test. UI scope only; this
// is NOT a real-backend test.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
import { participantMutation, participantQuery } from "./participant-convex-mock";
import { operatorMutation, operatorQuery } from "./operator-convex-mock";

export const CAMPAIGN_A = "campaign-a";
export const CAMPAIGN_B = "campaign-b";

const listeners = new Set<() => void>();
let version = 0;
let saveMode: "immediate" | "delayed" = "immediate";

/** Shared store access for the participant backend (same module instance). */
export function subscribeVersion(listener: () => void) {
	return subscribe(listener);
}
export function bumpVersion() {
	emit();
}
const campaignId = CAMPAIGN_A;
const pendingSaves: Array<{ id: number; campaignId: string; resolve: () => void }> = [];
let saveCounter = 0;
const recordedCalls: Array<Record<string, any>> = [];

const inventories: Record<string, any[]> = {
	[CAMPAIGN_A]: [
		{
			id: "inv-a-voucher", name: "Voucher quà tặng A", rewardType: "voucher",
			rewardTypeLabel: "Voucher / mã quà", amount: null, hasSecretCode: true,
			quantityTotal: 20, quantityRemaining: 20, weight: 20, isActive: true, poolTag: "vip",
		},
	],
	[CAMPAIGN_B]: [
		{
			id: "inv-b-points", name: "Điểm thưởng B", rewardType: "points",
			rewardTypeLabel: "Điểm", amount: 25, hasSecretCode: false,
			quantityTotal: 50, quantityRemaining: 50, weight: 30, isActive: true, poolTag: "loyalty",
		},
	],
};

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};
const emit = () => {
	version += 1;
	listeners.forEach((listener) => listener());
};

// Version-keyed result cache: identities stay stable between renders until
// the backing data changes, so product effects keyed on query identity do
// not loop (React maximum-update-depth).
const queryCache = new Map<string, { version: number; value: unknown }>();

export function useQuery(ref: any, args: any) {
	const snapshotVersion = useSyncExternalStore(subscribe, () => version, () => version);
	if (args === "skip") return undefined;
	const name = getFunctionName(ref);
	const cacheKey = JSON.stringify([name, args]);
	const cached = queryCache.get(cacheKey);
	if (cached && cached.version === snapshotVersion) {
		return cached.value;
	}
	let value: unknown;
	if (name === "rewardInventory:getRewardInventory") {
		value = { items: structuredClone(inventories[args.campaignId] ?? []) };
	} else if (name.startsWith("publicPlay:")) {
		value = participantQuery(name, args);
	} else if (
		name.startsWith("campaigns:") ||
		name.startsWith("campaignGames:") ||
		name.startsWith("shareLinks:") ||
		name.startsWith("draw:")
	) {
		value = operatorQuery(name, args);
	} else {
		throw new Error(`Unsupported synthetic query: ${name}`);
	}
	queryCache.set(cacheKey, { version: snapshotVersion, value });
	return value;
}

export function useMutation(ref: any) {
	const name = getFunctionName(ref);
	return useCallback(
		async (args: any) => {
			if (name.startsWith("publicPlay:")) {
				return participantMutation(name, args);
			}
			if (
				name.startsWith("campaigns:") ||
				name.startsWith("campaignGames:") ||
				name.startsWith("shareLinks:")
			) {
				return operatorMutation(name, args);
			}
			if (name !== "rewardInventory:configureRewardInventory") {
				throw new Error(`Unsupported synthetic mutation: ${name}`);
			}
			recordedCalls.push(JSON.parse(JSON.stringify({ name, ...args })));
			if (saveMode === "delayed") {
				const id = ++saveCounter;
				await new Promise<void>((resolve) => {
					pendingSaves.push({ id, campaignId: args.campaignId, resolve });
					emit();
				});
			}
			// Metadata-only implementation of the owner response contract; the
			// real handler contract is covered by convex/rewardInventory.test.ts.
			const previous = inventories[args.campaignId] ?? [];
			const ids = args.items.map(
				(item: any, index: number) =>
					item.existingItemId ?? `inv-created-${saveCounter}-${index}`,
			);
			for (const item of args.items) {
				if (item.existingItemId && !previous.some((row: any) => row.id === item.existingItemId)) {
					throw new Error("Synthetic existing inventory row is foreign");
				}
			}
			inventories[args.campaignId] = args.items.map((item: any, index: number) => {
				const old = previous.find((row: any) => row.id === item.existingItemId);
				return {
					id: ids[index],
					name: item.name,
					rewardType: item.rewardType,
					rewardTypeLabel: item.rewardType,
					amount: item.amount ?? null,
					hasSecretCode:
						item.rewardType === "voucher" &&
						!item.removeSecretCode &&
						(Boolean(item.secretCode?.trim()) || Boolean(old?.hasSecretCode)),
					quantityTotal: item.quantity,
					quantityRemaining: item.quantity,
					weight: item.weight,
					isActive: item.isActive,
					poolTag: item.poolTag?.trim().slice(0, 24) || "default",
				};
			});
			emit();
			return { count: args.items.length, ids };
		},
		[name],
	);
}

let setCampaignIdHook: ((id: string) => void) | null = null;

/** Programmatic controls for Playwright: response timing and data only. */
export const fixtureApi = {
	campaigns: { A: CAMPAIGN_A, B: CAMPAIGN_B },
	switchCampaign(id: string) {
		setCampaignIdHook?.(id);
	},
	setSaveMode(mode: "immediate" | "delayed") {
		saveMode = mode;
		emit();
	},
	pendingSaveCount() {
		return pendingSaves.length;
	},
	releaseSave() {
		const oldest = pendingSaves.shift();
		oldest?.resolve();
		emit();
	},
	releaseNewestSave() {
		const newest = pendingSaves.pop();
		newest?.resolve();
		emit();
	},
	calls(name: string) {
		return structuredClone(recordedCalls.filter((call) => call.name === name));
	},
	state() {
		return { campaignId, saveMode, pendingSaves: pendingSaves.length };
	},
	__registerCampaignSetter(setter: (id: string) => void) {
		setCampaignIdHook = setter;
	},
};

if (typeof window !== "undefined") {
	(window as any).__inventoryFixture = fixtureApi;
}
