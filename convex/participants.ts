import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
	generateParticipantToken,
	sanitizeProvidedName,
} from "../lib/playPolicy";

type ConvexCtx = QueryCtx | MutationCtx;

/**
 * Anonymous participant identity. The token is an unguessable capability the
 * client stores locally; device identity is best-effort only. A provided
 * display name is stored for operator convenience and never used to match,
 * look up, or authorize a participant.
 */
export async function getParticipantByToken(
	ctx: ConvexCtx,
	token: string,
	campaignId: Id<"campaigns">,
): Promise<Doc<"participants"> | null> {
	const rows = await ctx.db
		.query("participants")
		.withIndex("by_token_campaign", (q) =>
			q.eq("token", token).eq("campaignId", campaignId),
		)
		.collect();
	if (rows.length > 1) {
		throw new Error("Dữ liệu người tham gia không nhất quán");
	}
	return rows[0] ?? null;
}

export async function getOrCreateParticipant(
	ctx: MutationCtx,
	args: {
		ownerId: Id<"users">;
		campaignId: Id<"campaigns">;
		participantToken?: string;
		displayName?: string;
	},
): Promise<{ participant: Doc<"participants">; created: boolean }> {
	const displayName = sanitizeProvidedName(args.displayName);
	if (args.participantToken) {
		const existing = await getParticipantByToken(ctx, args.participantToken, args.campaignId);
		if (existing) {
			if (displayName && displayName !== existing.displayName) {
				await ctx.db.patch(existing._id, {
					displayName,
					updatedAt: Date.now(),
				});
				return {
					participant: { ...existing, displayName },
					created: false,
				};
			}
			return { participant: existing, created: false };
		}
	}

	const now = Date.now();
	const participantId = await ctx.db.insert("participants", {
		ownerId: args.ownerId,
		campaignId: args.campaignId,
		token: args.participantToken ?? generateParticipantToken(),
		displayName,
		createdAt: now,
		updatedAt: now,
	});
	const participant = await ctx.db.get(participantId);
	if (!participant) {
		throw new Error("Không thể tạo người tham gia");
	}
	return { participant, created: true };
}
