const OWNER_SESSION_KEY = "li_xi_owner_session";

export type OwnerSession = {
  username: string;
  authSource: "convexAuth";
};

type StoredLegacyOwnerSession = {
  userId: string;
  username: string;
  authSource?: "legacy";
};

type LegacyOwnerSessionCleanupSignal = {
  authSource: "legacy";
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeToOwnerSession(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isLegacyOwnerSession(value: unknown): value is StoredLegacyOwnerSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === "string" &&
    typeof candidate.username === "string" &&
    candidate.authSource === "legacy"
  );
}

let cachedSession: LegacyOwnerSessionCleanupSignal | null | undefined = undefined;

export function readOwnerSession(): LegacyOwnerSessionCleanupSignal | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (cachedSession !== undefined) {
    return cachedSession;
  }

  const raw = localStorage.getItem(OWNER_SESSION_KEY);
  if (!raw) {
    cachedSession = null;
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isLegacyOwnerSession(parsed)) {
      localStorage.removeItem(OWNER_SESSION_KEY);
      cachedSession = null;
      return null;
    }
    cachedSession = { authSource: "legacy" };
    return cachedSession;
  } catch {
    localStorage.removeItem(OWNER_SESSION_KEY);
    cachedSession = null;
    return null;
  }
}

export function clearOwnerSession() {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(OWNER_SESSION_KEY);
  cachedSession = null;
  notify();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === OWNER_SESSION_KEY) {
      cachedSession = undefined; // Force re-read
      notify();
    }
  });
}
