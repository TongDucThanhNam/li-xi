"use client";

import { useSyncExternalStore } from "react";
import { OwnerSession, readOwnerSession, subscribeToOwnerSession } from "./ownerSession";

export function useOwnerSession() {
  return useSyncExternalStore(
    subscribeToOwnerSession,
    readOwnerSession,
    () => undefined
  ) as OwnerSession | null | undefined;
}
