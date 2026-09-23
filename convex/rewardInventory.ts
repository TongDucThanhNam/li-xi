import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { requireResolvedOwner } from "./authorization";
import { DEFAULT_REWARD_POOL_TAG } from "../lib/gameTemplates";
import { REWARD_TYPE_LABELS, type RewardType } from "../lib/playPolicy";

type ConvexCtx = QueryCtx | MutationCtx;

const MAX_INVENTORY_ITEMS = 100;
const MAX_ITEM_NAME_LENGTH = 60;
const MAX_SECRET_CODE_LENGTH = 120;
const MAX_ITEM_QUANTITY = 100000;
const MAX_ITEM_WEIGHT = 100;
const MAX_ITEM_AMOUNT = 2_000_000_000;

type RewardInventoryInput = {
	/** Stored row this input updates; absent = create a new row. */
	existingItemId?: Id<"rewardInventory">;
	name: string;
	rewardType: "cash" | "voucher" | "physical" | "points";
	amount?: number;
	/**
	 * Replacement secret. Omitted/blank on a retained voucher row means
	 * PRESERVE the stored code; an explicit value replaces it. Blank input
	 * alone never erases a stored code (that requires removeSecretCode).
	 */
	secretCode?: string;
	/** Explicit intention to clear a stored voucher code. */
	removeSecretCode?: boolean;
	quantity: number;
	weight: number;
	isActive: boolean;
	poolTag?: string;
};

export function normalizeRewardPoolTag(value: string | undefined): string {
	return value?.trim().slice(0, 24) || DEFAULT_REWARD_POOL_TAG;
}

function validateInventoryItems(items: RewardInventoryInput[]) {
	if (items.length === 0) {
		throw new Error("Cần ít nhất 1 phần thưởng trong kho");
	}
	if (items.length > MAX_INVENTORY_ITEMS) {
		throw new Error(`Tối đa ${MAX_INVENTORY_ITEMS} phần thưởng trong kho`);
	}

	const seenNames = new Set<string>();
	const seenIds = new Set<string>();
	let hasActive = false;
	for (const item of items) {
		if (item.existingItemId) {
			if (seenIds.has(item.existingItemId)) {
				throw new Error("Một phần thưởng đã lưu được tham chiếu hai lần trong biểu mẫu");
			}
			seenIds.add(item.existingItemId);
		}
		if (item.removeSecretCode && item.rewardType !== "voucher") {
			throw new Error("Chỉ phần thưởng voucher mới có thể xoá mã bí mật");
		}
		const name = item.name.trim().replace(/\s+/g, " ");
		if (name.length < 1 || name.length > MAX_ITEM_NAME_LENGTH) {
			throw new Error(`Tên phần thưởng phải từ 1-${MAX_ITEM_NAME_LENGTH} ký tự`);
		}
		const nameKey = name.toLowerCase();
		if (seenNames.has(nameKey)) {
			throw new Error(`Phần thưởng "${name}" bị trùng tên`);
		}
		seenNames.add(nameKey);

		if (
			item.rewardType !== "voucher" &&
			item.rewardType !== "physical" &&
			item.rewardType !== "points" &&
			item.rewardType !== "cash"
		) {
			throw new Error("Loại phần thưởng không hợp lệ");
		}
		const needsAmount = item.rewardType === "cash" || item.rewardType === "points";
		if (item.amount !== undefined) {
			if (!Number.isSafeInteger(item.amount) || item.amount <= 0 || item.amount > MAX_ITEM_AMOUNT) {
				throw new Error("Giá trị phần thưởng phải là số nguyên dương hợp lệ");
			}
			if (!needsAmount) {
				throw new Error("Chỉ phần thưởng tiền mặt hoặc điểm mới có giá trị số");
			}
		} else if (needsAmount) {
			throw new Error("Phần thưởng tiền mặt hoặc điểm cần có giá trị");
		}

		const secretCode = item.secretCode?.trim();
		if (secretCode && secretCode.length > MAX_SECRET_CODE_LENGTH) {
			throw new Error(`Mã bí mật tối đa ${MAX_SECRET_CODE_LENGTH} ký tự`);
		}
		if (secretCode && item.rewardType !== "voucher") {
			throw new Error("Chỉ phần thưởng voucher mới có mã bí mật");
		}

		if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > MAX_ITEM_QUANTITY) {
			throw new Error("Số lượng phần thưởng phải là số nguyên dương hợp lệ");
		}
		if (!Number.isSafeInteger(item.weight) || item.weight <= 0 || item.weight > MAX_ITEM_WEIGHT) {
			throw new Error("Trọng số trúng thưởng phải từ 1-100");
		}
		if (item.isActive) {
			hasActive = true;
		}
	}

	if (!hasActive) {
		throw new Error("Cần ít nhất 1 phần thưởng đang kích hoạt");
	}

	return items.map((item, index) => ({
		existingItemId: item.existingItemId,
		name: item.name.trim().replace(/\s+/g, " "),
		rewardType: item.rewardType,
		amount: item.amount,
		secretCode: item.secretCode?.trim() || undefined,
		removeSecretCode: item.removeSecretCode === true,
		quantity: item.quantity,
		weight: item.weight,
		isActive: item.isActive,
		poolTag: normalizeRewardPoolTag(item.poolTag),
		displayOrder: index,
	}));
}

async function requireOwnedCampaign(ctx: ConvexCtx, ownerId: Id<"users">, campaignId: Id<"campaigns">) {
	const campaign = await ctx.db.get(campaignId);
	if (!campaign || campaign.ownerId !== ownerId) {
		throw new Error("Không tìm thấy chiến dịch");
	}
	return campaign;
}

export async function listActiveRewardInventory(
	ctx: ConvexCtx,
	ownerId: Id<"users">,
	campaignId: Id<"campaigns">,
	poolTag = DEFAULT_REWARD_POOL_TAG,
): Promise<Doc<"rewardInventory">[]> {
	const items = await ctx.db
		.query("rewardInventory")
		.withIndex("by_campaign_owner_active", (q) =>
			q.eq("campaignId", campaignId).eq("ownerId", ownerId).eq("isActive", true),
		)
		.collect();
	return items
		.filter(
			(item) =>
				item.quantityRemaining > 0 &&
				(item.poolTag ?? DEFAULT_REWARD_POOL_TAG) === poolTag,
		)
		.sort((left, right) => left.displayOrder - right.displayOrder);
}

export const getRewardInventory = query({
	args: {
		campaignId: v.id("campaigns"),
	},
	handler: async (ctx, args) => {
		const { ownerId } = await requireResolvedOwner(ctx, undefined, {
			notFoundMessage: "Không tìm thấy host",
			forbiddenMessage: "Bạn không có quyền xem kho phần thưởng này",
		});
		await requireOwnedCampaign(ctx, ownerId, args.campaignId);
		const items = await ctx.db
			.query("rewardInventory")
			.withIndex("by_campaign_owner_active", (q) =>
				q.eq("campaignId", args.campaignId).eq("ownerId", ownerId).eq("isActive", true),
			)
			.collect();
		const inactiveItems = await ctx.db
			.query("rewardInventory")
			.withIndex("by_campaign_owner_active", (q) =>
				q.eq("campaignId", args.campaignId).eq("ownerId", ownerId).eq("isActive", false),
			)
			.collect();
		const allItems = [...items, ...inactiveItems].sort((left, right) => {
			if (left.displayOrder !== right.displayOrder) {
				return left.displayOrder - right.displayOrder;
			}
			return left.createdAt - right.createdAt;
		});

		return {
			items: allItems.map((item) => ({
				id: item._id,
				name: item.name,
				rewardType: item.rewardType,
				rewardTypeLabel: REWARD_TYPE_LABELS[item.rewardType as RewardType],
				amount: item.amount ?? null,
				hasSecretCode: Boolean(item.secretCode),
				quantityTotal: item.quantityTotal,
				quantityRemaining: item.quantityRemaining,
				weight: item.weight,
				isActive: item.isActive,
				poolTag: item.poolTag ?? DEFAULT_REWARD_POOL_TAG,
			})),
		};
	},
});

/**
 * Replace-style inventory configuration, mirroring the legacy budget editor.
 * Existing remaining quantities are reset to the configured totals, so this is
 * intended for pre-launch setup; exhausted stock is explicitly restocked here.
 */
export const configureRewardInventory = mutation({
	args: {
		campaignId: v.id("campaigns"),
		items: v.array(
			v.object({
				existingItemId: v.optional(v.id("rewardInventory")),
				name: v.string(),
				rewardType: v.union(
					v.literal("cash"),
					v.literal("voucher"),
					v.literal("physical"),
					v.literal("points"),
				),
				amount: v.optional(v.number()),
				secretCode: v.optional(v.string()),
				removeSecretCode: v.optional(v.boolean()),
				quantity: v.number(),
				weight: v.number(),
				isActive: v.boolean(),
				poolTag: v.optional(v.string()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const { ownerId } = await requireResolvedOwner(ctx, undefined, {
			notFoundMessage: "Không tìm thấy host",
			forbiddenMessage: "Bạn không có quyền chỉnh kho phần thưởng này",
		});
		const campaign = await requireOwnedCampaign(ctx, ownerId, args.campaignId);
		const normalized = validateInventoryItems(args.items);

		const existing = await ctx.db
			.query("rewardInventory")
			.withIndex("by_campaign_owner_active", (q) =>
				q.eq("campaignId", campaign._id).eq("ownerId", ownerId).eq("isActive", true),
			)
			.collect();
		const existingInactive = await ctx.db
			.query("rewardInventory")
			.withIndex("by_campaign_owner_active", (q) =>
				q.eq("campaignId", campaign._id).eq("ownerId", ownerId).eq("isActive", false),
			)
			.collect();

		// Safety gate: once any stock has been awarded, a replace-style save
		// could silently reset consumed quantities or invalidate awarded
		// secrets. Reject the edit instead; claims still recover the original
		// details through the immutable award snapshots. Explicit restocking
		// is a separate future operation, not a silent side effect of saving.
		// Active admitted sessions present frozen inventory identities; block
		// edits while any such session is in flight (stage-1 safety boundary).
		const campaignGames = await ctx.db
			.query("campaignGames")
			.withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
			.collect();
		for (const game of campaignGames) {
			const activeRows = await ctx.db
				.query("playSessions")
				.withIndex("by_campaignGame_status", (q) =>
					q.eq("campaignGameId", game._id).eq("status", "active"),
				)
				.take(1);
			if (activeRows.length > 0) {
				throw new Error(
					"Đang có lượt chơi chưa hoàn thành; không thể chỉnh kho phần thưởng lúc này.",
				);
			}
		}

		const allRows = [...existing, ...existingInactive];
		if (allRows.some((row) => row.quantityRemaining < row.quantityTotal)) {
			throw new Error(
				"Kho đã có phần thưởng được trao, không thể thay thế trực tiếp. Hãy tạo kho mới sau khi chốt chiến dịch hoặc liên hệ vận hành để restock có kiểm soát.",
			);
		}

		// Row retention: inputs referencing existingItemId update those exact
		// rows in place. Every referenced id must exist and belong to THIS
		// owner AND this campaign (already enforced by ownership below); the
		// duplicate check ran during validation. Rows never referenced by the
		// payload are deleted — the same prelaunch replace-style intent as
		// before, now without discarding retained row identities, pool tags or
		// preserved secret codes.
		const referencedIds = new Set(
			normalized
				.map((item) => item.existingItemId)
				.filter((id): id is Id<"rewardInventory"> => id !== undefined),
		);
		const retainedRows = new Map<Id<"rewardInventory">, Doc<"rewardInventory">>();
		for (const id of referencedIds) {
			const row = await ctx.db.get(id);
			if (!row || row.ownerId !== ownerId || row.campaignId !== campaign._id) {
				throw new Error(
					"Phần thưởng đã lưu không thuộc chiến dịch này; hãy tải lại kho và thử lại.",
				);
			}
			retainedRows.set(id, row);
		}

		const now = Date.now();
		const resultIds: Id<"rewardInventory">[] = [];
		for (const item of normalized) {
			if (item.existingItemId) {
				const row = retainedRows.get(item.existingItemId)!;
				// Secret resolution for retained voucher rows: explicit
				// replacement wins; blank input PRESERVES the stored code; only
				// the explicit removal intention clears it. Changing the reward
				// type away from voucher intentionally drops the stored secret
				// (secrets are voucher-only).
				let secretCode: string | undefined = row.secretCode;
				if (item.rewardType === "voucher") {
					if (item.secretCode !== undefined) {
						secretCode = item.secretCode;
					}
					if (item.removeSecretCode) {
						secretCode = undefined;
					}
				} else {
					secretCode = undefined;
				}
				await ctx.db.patch(item.existingItemId, {
					name: item.name,
					rewardType: item.rewardType,
					amount: item.amount,
					secretCode,
					quantityTotal: item.quantity,
					quantityRemaining: item.quantity,
					weight: item.weight,
					isActive: item.isActive,
					displayOrder: item.displayOrder,
					poolTag: item.poolTag,
					updatedAt: now,
				});
				resultIds.push(item.existingItemId);
			} else {
				resultIds.push(
					await ctx.db.insert("rewardInventory", {
						ownerId,
						campaignId: campaign._id,
						name: item.name,
						rewardType: item.rewardType,
						amount: item.amount,
						secretCode: item.secretCode,
						quantityTotal: item.quantity,
						quantityRemaining: item.quantity,
						weight: item.weight,
						isActive: item.isActive,
						displayOrder: item.displayOrder,
						poolTag: item.poolTag,
						createdAt: now,
						updatedAt: now,
					}),
				);
			}
		}

		for (const row of allRows) {
			if (!referencedIds.has(row._id)) {
				await ctx.db.delete(row._id);
			}
		}

		return { count: resultIds.length, ids: resultIds };
	},
});
