import {
	assertPublicClaimPath,
	buildPublicAppUrlFromOrigin,
	parseCleanPublicAppOrigin,
} from "./publicAppUrlPolicy";

export function getPublicAppOrigin() {
	const configuredOrigin = parseCleanPublicAppOrigin(import.meta.env.VITE_SITE_URL);
	if (configuredOrigin) {
		return configuredOrigin;
	}

	if (typeof window !== "undefined") {
		return window.location.origin;
	}

	return "";
}

export function buildPublicAppUrl(path: string) {
	const origin = getPublicAppOrigin();
	return buildPublicAppUrlFromOrigin(path, origin);
}

export function buildPublicClaimUrl(path: string) {
	return buildPublicAppUrl(assertPublicClaimPath(path));
}

export function getBillingReturnPublicAppUrl() {
	return buildPublicAppUrl("/campaigns");
}

export function getCurrentPublicAppUrl() {
	if (typeof window === "undefined") {
		return getPublicAppOrigin();
	}

	const currentPath = `${window.location.pathname}${window.location.search}`;
	return buildPublicAppUrl(currentPath);
}
