import { isLocalOrPrivateHostname, isRawIpHostname, normalizeHostname } from "./networkPolicy.ts";

function isLocalDevHostname(hostname: string) {
	const normalizedHostname = normalizeHostname(hostname);
	return (
		normalizedHostname === "localhost" ||
		normalizedHostname === "127.0.0.1" ||
		normalizedHostname === "::1"
	);
}

function isLocalNetworkHostname(hostname: string) {
	return isLocalOrPrivateHostname(hostname);
}

const publicPlayPathPattern = /^\/play\/[a-f0-9]{24}$/;
const publicClaimPathPattern = /^\/claim\/[a-f0-9]{24}$/;
const publicPlayCodePattern = /^[a-f0-9]{24}$/;

export function parseCleanPublicAppOrigin(value: string | undefined) {
	const trimmedValue = value?.trim();
	if (!trimmedValue) {
		return null;
	}

	try {
		const url = new URL(trimmedValue);
		if (
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			(url.pathname && url.pathname !== "/")
		) {
			return null;
		}

		if (isLocalDevHostname(url.hostname)) {
			return url.origin;
		}

		if (
			url.protocol !== "https:" ||
			url.port ||
			isRawIpHostname(url.hostname) ||
			isLocalNetworkHostname(url.hostname)
		) {
			return null;
		}

		return url.origin;
	} catch {
		return null;
	}
}

export function buildPublicAppUrlFromOrigin(path: string, origin: string) {
	if (!path.startsWith("/") || path.startsWith("//")) {
		throw new Error("Public app URL path must be root-relative");
	}

	if (!origin) {
		return path;
	}

	return new URL(path, origin).toString();
}

export function assertPublicPlayPath(path: string) {
	if (!publicPlayPathPattern.test(path)) {
		throw new Error("Public play URL path must be /play/<24-character lowercase hex code>");
	}
	return path;
}

export function assertPublicClaimPath(path: string) {
	if (!publicClaimPathPattern.test(path)) {
		throw new Error("Public claim URL path must be /claim/<24-character lowercase hex code>");
	}
	return path;
}

export function normalizePublicPlayCode(value: string) {
	const publicCode = value.trim().toLowerCase();
	return publicPlayCodePattern.test(publicCode) ? publicCode : null;
}
