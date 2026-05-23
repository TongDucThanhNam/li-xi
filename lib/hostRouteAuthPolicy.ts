const CONVEX_AUTH_JWT_KEY = "__convexAuthJWT";
const CONVEX_AUTH_REFRESH_TOKEN_KEY = "__convexAuthRefreshToken";

type StorageReader = {
  getItem(key: string): string | null;
};

export function convexAuthStorageNamespace(convexUrl: string | undefined) {
  return (convexUrl ?? "").replace(/[^a-zA-Z0-9]/g, "");
}

export function hasConvexAuthSessionInStorage(
  storage: StorageReader,
  convexUrl: string | undefined
) {
  const namespace = convexAuthStorageNamespace(convexUrl);
  if (!namespace) {
    return false;
  }

  return Boolean(
    storage.getItem(`${CONVEX_AUTH_JWT_KEY}_${namespace}`) ||
      storage.getItem(`${CONVEX_AUTH_REFRESH_TOKEN_KEY}_${namespace}`)
  );
}

export function shouldAllowHostRoute(args: {
  isBrowser: boolean;
  storage: StorageReader | null;
  convexUrl: string | undefined;
}) {
  if (!args.isBrowser) {
    // Convex Auth stores the browser session client-side, so SSR cannot prove it here.
    return true;
  }

  const hasConvexAuthSession =
    args.storage !== null &&
    hasConvexAuthSessionInStorage(args.storage, args.convexUrl);

  return hasConvexAuthSession;
}
