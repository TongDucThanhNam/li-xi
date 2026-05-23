import { redirect } from "@tanstack/react-router";
import { shouldAllowHostRoute } from "./hostRouteAuthPolicy";

const viteEnv = import.meta.env ?? {};

export function requireHostRouteAuth() {
  if (
    shouldAllowHostRoute({
      isBrowser: typeof window !== "undefined",
      storage: typeof window === "undefined" ? null : window.localStorage,
      convexUrl: viteEnv.VITE_CONVEX_URL,
    })
  ) {
    return;
  }

  throw redirect({
    to: "/auth",
    replace: true,
  });
}
