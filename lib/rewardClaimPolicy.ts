/**
 * Reward-code display policy for operator surfaces. Secret codes stay
 * masked in every list payload; the full code leaves the server only through
 * the explicit reveal action (rewardClaims:revealRewardClaimCode), and never
 * enters analytics events.
 */
export const REWARD_CODE_MASK = "••••";

/** Masked presentation: fixed mask prefix plus the last 4 characters. */
export function maskRewardCode(code: string | null | undefined): string | null {
  const trimmed = typeof code === "string" ? code.trim() : "";
  if (!trimmed) {
    return null;
  }
  return `${REWARD_CODE_MASK}${trimmed.slice(-4)}`;
}

/**
 * Exact-match normalization for the operator code-search box: trimmed and
 * case-insensitive so a hand-typed voucher code still matches its stored
 * form; the search is whole-code (never a substring match).
 */
export function normalizeRewardCodeSearch(value: string): string {
  return value.trim().toLowerCase();
}

export function rewardCodeMatchesSearch(code: string | null | undefined, search: string): boolean {
  const trimmed = typeof code === "string" ? code.trim().toLowerCase() : "";
  const normalizedSearch = normalizeRewardCodeSearch(search);
  if (!normalizedSearch) {
    return false;
  }
  return trimmed === normalizedSearch;
}
