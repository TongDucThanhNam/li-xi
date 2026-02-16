import { Id } from "@/convex/_generated/dataModel";

const OWNER_SESSION_KEY = "li_xi_owner_session";

export type OwnerSession = {
  userId: Id<"users">;
  username: string;
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

function isOwnerSession(value: unknown): value is OwnerSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.userId === "string" && typeof candidate.username === "string";
}

let cachedSession: OwnerSession | null | undefined = undefined;

export function readOwnerSession(): OwnerSession | null {
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
    if (!isOwnerSession(parsed)) {
      localStorage.removeItem(OWNER_SESSION_KEY);
      cachedSession = null;
      return null;
    }
    cachedSession = parsed;
    return cachedSession;
  } catch {
    localStorage.removeItem(OWNER_SESSION_KEY);
    cachedSession = null;
    return null;
  }
}

export function writeOwnerSession(session: OwnerSession) {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(OWNER_SESSION_KEY, JSON.stringify(session));
  cachedSession = session;
  notify();
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
