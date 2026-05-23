"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { clearOwnerSession } from "./ownerSession";

export function useHostLogout() {
  const { signOut } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();

  return async () => {
    clearOwnerSession();
    if (isAuthenticated) {
      await signOut();
    }
  };
}
