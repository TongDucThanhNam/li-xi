export const PUBLIC_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PUBLIC_CODE_BYTES = 12;
export const PUBLIC_CODE_HEX_LENGTH = PUBLIC_CODE_BYTES * 2;
const publicCodePattern = new RegExp(`^[a-f0-9]{${PUBLIC_CODE_HEX_LENGTH}}$`);

type PendingSessionCandidate = {
  status: "pending" | "redeemed" | "cancelled";
  deliveryMode?: "station" | "link";
  publicCode?: string;
  createdAt: number;
  publicCodeExpiresAt?: number;
};

export function isSafePublicLinkTimestamp(value: number | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function normalizePublicCode(value: string) {
  const publicCode = value.trim().toLowerCase();
  return publicCodePattern.test(publicCode) ? publicCode : null;
}

export function getPublicLinkExpiresAt(createdAt: number) {
  if (!isSafePublicLinkTimestamp(createdAt)) {
    throw new Error("Thời điểm tạo link public không hợp lệ");
  }
  const expiresAt = createdAt + PUBLIC_LINK_TTL_MS;
  if (!isSafePublicLinkTimestamp(expiresAt)) {
    throw new Error("Thời điểm hết hạn link public không hợp lệ");
  }
  return expiresAt;
}

export function resolvePublicLinkExpiresAt(session: PendingSessionCandidate) {
  if (session.publicCodeExpiresAt !== undefined) {
    if (
      !isSafePublicLinkTimestamp(session.createdAt) ||
      !isSafePublicLinkTimestamp(session.publicCodeExpiresAt)
    ) {
      return 0;
    }

    let maxExpiresAt: number;
    try {
      maxExpiresAt = getPublicLinkExpiresAt(session.createdAt);
    } catch {
      return 0;
    }
    if (session.publicCodeExpiresAt > maxExpiresAt) {
      return 0;
    }

    return session.publicCodeExpiresAt;
  }
  if (isSafePublicLinkTimestamp(session.createdAt)) {
    try {
      return getPublicLinkExpiresAt(session.createdAt);
    } catch {
      return 0;
    }
  }

  return 0;
}

export function isPendingLinkSession(session: PendingSessionCandidate) {
  const deliveryMode = session.deliveryMode ?? (session.publicCode ? "link" : "station");
  return session.status === "pending" && deliveryMode === "link";
}

export function isExpiredPendingLinkSession(session: PendingSessionCandidate, now = Date.now()) {
  return isPendingLinkSession(session) && resolvePublicLinkExpiresAt(session) <= now;
}

export function isOpenPendingSession(session: PendingSessionCandidate, now = Date.now()) {
  if (session.status !== "pending") {
    return false;
  }
  if (isPendingLinkSession(session)) {
    return !isExpiredPendingLinkSession(session, now);
  }
  return true;
}
