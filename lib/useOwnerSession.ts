"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/convex/_generated/api";
import {
  clearOwnerSession,
  readOwnerSession,
  subscribeToOwnerSession,
} from "./ownerSession";
import type { OwnerSession } from "./ownerSession";

export function useOwnerSession() {
  const legacySession = useSyncExternalStore(
    subscribeToOwnerSession,
    readOwnerSession,
    () => undefined
  ) as ReturnType<typeof readOwnerSession> | undefined;

  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(
    api.auth.getCurrentUser,
    isAuthenticated ? {} : "skip"
  );

  useEffect(() => {
    if (legacySession) {
      clearOwnerSession();
    }
  }, [legacySession]);

  if (isAuthenticated) {
    if (currentUser === undefined) {
      return undefined;
    }
    if (currentUser === null) {
      return null;
    }
    return {
      username: currentUser.username,
      authSource: "convexAuth",
    } satisfies OwnerSession;
  }

  if (isLoading && legacySession === undefined) {
    return undefined;
  }

  return null;
}
