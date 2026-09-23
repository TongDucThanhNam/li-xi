import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { requireResolvedOwner } from "./authorization";
import { requireOwnedCampaignGame } from "./campaignGames";
import { generateShareCode, normalizeShareCode } from "../lib/playPolicy";

type ConvexCtx = QueryCtx | MutationCtx;

const MAX_LINKS_PER_GAME = 50;
const MAX_CHANNEL_LENGTH = 32;
const MAX_LABEL_LENGTH = 60;

export type ResolvedShareLink = {
	link: Doc<"publicPlayLinks">;
	campaignGame: Doc<"campaignGames">;
	campaign: Doc<"campaigns">;
};

export type ShareLinkResolution =
	| { state: "invalid" }
	| { state: "revoked" }
	| { state: "closed"; reason: "campaign-inactive" | "game-inactive" | "campaign-missing" | "game-missing" }
	| { state: "open"; resolved: ResolvedShareLink };

/**
 * Resolve a share code into a playable link. Fails closed for malformed
 * codes, revoked links, and inactive campaigns/games; never leaks other
 * owners' assets.
 */
export async function resolveShareLink(
	ctx: ConvexCtx,
	rawShareCode: string,
): Promise<ShareLinkResolution> {
	const shareCode = normalizeShareCode(rawShareCode);
	if (!shareCode) {
		return { state: "invalid" };
	}
	const linkRows = await ctx.db
		.query("publicPlayLinks")
		.withIndex("by_shareCode", (q) => q.eq("shareCode", shareCode))
		.collect();
	if (linkRows.length > 1) {
		throw new Error("Dữ liệu liên kết không nhất quán");
	}
	const link = linkRows[0];
	if (!link) {
		return { state: "invalid" };
	}
	if (link.status === "revoked") {
		return { state: "revoked" };
	}

	const campaign = await ctx.db.get(link.campaignId);
	if (!campaign || campaign.ownerId !== link.ownerId) {
		return { state: "closed", reason: "campaign-missing" };
	}
	if (campaign.status !== "active") {
		return { state: "closed", reason: "campaign-inactive" };
	}
	const campaignGame = await ctx.db.get(link.campaignGameId);
	if (!campaignGame || campaignGame.ownerId !== link.ownerId || campaignGame.campaignId !== campaign._id) {
		return { state: "closed", reason: "game-missing" };
	}
	if (campaignGame.status !== "active") {
		return { state: "closed", reason: "game-inactive" };
	}

	return { state: "open", resolved: { link, campaignGame, campaign } };
}

async function requireOwnedLink(
	ctx: ConvexCtx,
	ownerId: Id<"users">,
	shareLinkId: Id<"publicPlayLinks">,
): Promise<Doc<"publicPlayLinks">> {
	const link = await ctx.db.get(shareLinkId);
	if (!link || link.ownerId !== ownerId) {
		throw new Error("Không tìm thấy liên kết");
	}
	return link;
}

export const listShareLinks = query({
	args: {
		campaignId: v.id("campaigns"),
	},
	handler: async (ctx, args) => {
		const { ownerId } = await requireResolvedOwner(ctx, undefined, {
			notFoundMessage: "Không tìm thấy host",
			forbiddenMessage: "Bạn không có quyền xem liên kết của chiến dịch này",
		});
		const campaign = await ctx.db.get(args.campaignId);
		if (!campaign || campaign.ownerId !== ownerId) {
			throw new Error("Không tìm thấy chiến dịch");
		}
		const links = await ctx.db
			.query("publicPlayLinks")
			.withIndex("by_campaign_createdAt", (q) => q.eq("campaignId", campaign._id))
			.order("desc")
			.take(100);
		const gameViews = await Promise.all(
			links.map(async (link) => {
				const game = await ctx.db.get(link.campaignGameId);
				return {
					id: link._id,
					shareCode: link.shareCode,
					campaignGameId: link.campaignGameId,
					campaignGameName: game?.name ?? null,
					templateId: game?.templateId ?? null,
					channel: link.channel,
					label: link.label ?? null,
					status: link.status,
					createdAt: link.createdAt,
					revokedAt: link.revokedAt ?? null,
				};
			}),
		);
		return { links: gameViews };
	},
});

export const createShareLink = mutation({
	args: {
		campaignGameId: v.id("campaignGames"),
		channel: v.string(),
		label: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { ownerId } = await requireResolvedOwner(ctx, undefined, {
			notFoundMessage: "Không tìm thấy host",
			forbiddenMessage: "Bạn không có quyền tạo liên kết cho trò chơi này",
		});
		const { campaignGame, campaign } = await requireOwnedCampaignGame(ctx, ownerId, args.campaignGameId);

		const existing = await ctx.db
			.query("publicPlayLinks")
			.withIndex("by_campaignGame_status", (q) =>
				q.eq("campaignGameId", campaignGame._id).eq("status", "active"),
			)
			.collect();
		if (existing.length >= MAX_LINKS_PER_GAME) {
			throw new Error(`Mỗi trò chơi tối đa ${MAX_LINKS_PER_GAME} liên kết đang hoạt động`);
		}

		const channel = args.channel.trim().toLowerCase().replace(/\s+/g, "-").slice(0, MAX_CHANNEL_LENGTH) || "direct";
		const label = args.label?.trim().slice(0, MAX_LABEL_LENGTH) || undefined;
		const now = Date.now();

		let shareCode = "";
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const candidate = generateShareCode();
			const collision = await ctx.db
				.query("publicPlayLinks")
				.withIndex("by_shareCode", (q) => q.eq("shareCode", candidate))
				.first();
			if (!collision) {
				shareCode = candidate;
				break;
			}
		}
		if (!shareCode) {
			throw new Error("Không thể tạo mã liên kết, vui lòng thử lại");
		}

		const shareLinkId = await ctx.db.insert("publicPlayLinks", {
			ownerId,
			campaignId: campaign._id,
			campaignGameId: campaignGame._id,
			shareCode,
			channel,
			label,
			status: "active",
			createdAt: now,
			updatedAt: now,
		});

		return { shareLinkId, shareCode, channel };
	},
});

export const revokeShareLink = mutation({
	args: {
		shareLinkId: v.id("publicPlayLinks"),
	},
	handler: async (ctx, args) => {
		const { ownerId } = await requireResolvedOwner(ctx, undefined, {
			notFoundMessage: "Không tìm thấy host",
			forbiddenMessage: "Bạn không có quyền thu hồi liên kết này",
		});
		const link = await requireOwnedLink(ctx, ownerId, args.shareLinkId);
		if (link.status === "revoked") {
			return { shareLinkId: link._id, status: "revoked" as const };
		}
		await ctx.db.patch(link._id, {
			status: "revoked",
			revokedAt: Date.now(),
			updatedAt: Date.now(),
		});
		return { shareLinkId: link._id, status: "revoked" as const };
	},
});

export const restoreShareLink = mutation({
	args: {
		shareLinkId: v.id("publicPlayLinks"),
	},
	handler: async (ctx, args) => {
		const { ownerId } = await requireResolvedOwner(ctx, undefined, {
			notFoundMessage: "Không tìm thấy host",
			forbiddenMessage: "Bạn không có quyền mở lại liên kết này",
		});
		const link = await requireOwnedLink(ctx, ownerId, args.shareLinkId);
		if (link.status === "active") {
			return { shareLinkId: link._id, status: "active" as const };
		}
		await ctx.db.patch(link._id, {
			status: "active",
			revokedAt: undefined,
			updatedAt: Date.now(),
		});
		return { shareLinkId: link._id, status: "active" as const };
	},
});
