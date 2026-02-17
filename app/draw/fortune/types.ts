import type { Rarity } from "@/lib/lixiPolicy";

export type Prize = {
	amount: number;
	rarity: Rarity;
};

export type RewardPoolItem = {
	amount: number;
	rarity: Rarity;
	remainingQuantity: number;
};

export type CardState = {
	isIn: boolean;
	isOpened: boolean;
	isMissed: boolean;
	prize: Prize | null;
};

export type Phase = "IDLE" | "INTRO" | "READY" | "REVEAL";
