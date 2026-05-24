import { isLocalOrPrivateHostname, isRawIpHostname } from "./networkPolicy.ts";

const billingReturnPath = "/campaigns";
const allowedBillingReturnPaths = new Set([billingReturnPath]);
const allowedCheckoutResultValues = new Set(["success"]);

type BillingProducts = Record<string, string>;

function cleanConfiguredBillingProductId(productId: string) {
  const trimmedProductId = productId.trim();
  if (!trimmedProductId || /\s/.test(trimmedProductId) || /[<>]/.test(trimmedProductId)) {
    return null;
  }
  return trimmedProductId;
}

export function configuredBillingProductIds(products: BillingProducts) {
  return new Set(
    Object.values(products).flatMap((productId) => {
      const cleanProductId = cleanConfiguredBillingProductId(productId);
      return cleanProductId ? [cleanProductId] : [];
    })
  );
}

export function assertCompleteBillingProductConfiguration(products: BillingProducts) {
  const configuredProductIds = Object.values(products).map(cleanConfiguredBillingProductId);
  if (configuredProductIds.some((productId) => productId === null)) {
    throw new Error("Cần cấu hình đủ Polar Pro và Business product IDs");
  }

  if (new Set(configuredProductIds).size !== configuredProductIds.length) {
    throw new Error("Polar Pro và Business product IDs phải khác nhau");
  }
}

export function assertConfiguredBillingProductId(
  productId: string,
  products: BillingProducts
) {
  const normalizedProductId = productId.trim();
  assertCompleteBillingProductConfiguration(products);
  const allowedProductIds = configuredBillingProductIds(products);

  if (!allowedProductIds.has(normalizedProductId)) {
    throw new Error("Polar product không thuộc cấu hình Pro/Business của hệ thống");
  }

  return normalizedProductId;
}

export function assertConfiguredCheckoutProductIds(
  productIds: string[],
  products: BillingProducts
) {
  if (productIds.length !== 1) {
    throw new Error("Checkout chỉ hỗ trợ một gói Pro/Business mỗi lần");
  }

  return [assertConfiguredBillingProductId(productIds[0], products)];
}

export function parseCleanOrigin(value: string, label: string) {
  const trimmedValue = value.trim();
  let url: URL;
  try {
    url = new URL(trimmedValue);
  } catch {
    throw new Error(`${label} không hợp lệ`);
  }

  const normalizedOrigin = url.origin.toLowerCase();
  const normalizedInput = trimmedValue.toLowerCase();
  const isCleanOrigin =
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    (url.pathname === "" || url.pathname === "/") &&
    url.search === "" &&
    url.hash === "" &&
    (normalizedInput === normalizedOrigin || normalizedInput === `${normalizedOrigin}/`) &&
    !isRawIpHostname(url.hostname) &&
    !isLocalOrPrivateHostname(url.hostname);

  if (!isCleanOrigin) {
    throw new Error(
      `${label} phải là HTTPS public origin không kèm path/query/hash/port/credentials`
    );
  }

  return url.origin;
}

export function getConfiguredSiteOrigin(siteUrl: string | undefined) {
  const cleanSiteUrl = siteUrl?.trim();
  if (!cleanSiteUrl) {
    throw new Error("Thiếu SITE_URL để tạo billing URL an toàn");
  }

  return parseCleanOrigin(cleanSiteUrl, "SITE_URL");
}

export function assertTrustedBillingOrigin(origin: string, siteUrl: string | undefined) {
  const requestedOrigin = parseCleanOrigin(origin, "Billing origin");
  const configuredOrigin = getConfiguredSiteOrigin(siteUrl);
  if (requestedOrigin !== configuredOrigin) {
    throw new Error("Billing origin không khớp SITE_URL");
  }

  return configuredOrigin;
}

export function assertTrustedBillingUrl(
  url: string,
  label: string,
  siteUrl: string | undefined
) {
  const trimmedUrl = url.trim();
  let requestedUrl: URL;
  try {
    requestedUrl = new URL(trimmedUrl);
  } catch {
    throw new Error(`${label} không hợp lệ`);
  }

  const isTrustedWebUrl =
    requestedUrl.protocol === "https:" &&
    requestedUrl.username === "" &&
    requestedUrl.password === "" &&
    requestedUrl.port === "" &&
    requestedUrl.hash === "" &&
    !isRawIpHostname(requestedUrl.hostname) &&
    !isLocalOrPrivateHostname(requestedUrl.hostname);
  if (!isTrustedWebUrl) {
    throw new Error(`${label} phải là HTTPS public URL không kèm port/credentials/hash`);
  }

  if (requestedUrl.origin !== getConfiguredSiteOrigin(siteUrl)) {
    throw new Error(`${label} không khớp SITE_URL`);
  }
  if (!allowedBillingReturnPaths.has(requestedUrl.pathname)) {
    throw new Error(`${label} phải quay về route billing hợp lệ`);
  }
  const searchEntries = [...requestedUrl.searchParams.entries()];
  const hasAllowedSearch =
    searchEntries.length === 0 ||
    (searchEntries.length === 1 &&
      searchEntries[0][0] === "checkout" &&
      allowedCheckoutResultValues.has(searchEntries[0][1]));
  if (!hasAllowedSearch) {
    throw new Error(`${label} chỉ được dùng query billing hợp lệ`);
  }
  if (trimmedUrl !== requestedUrl.toString()) {
    throw new Error(`${label} phải là URL canonical không kèm explicit default port`);
  }

  return requestedUrl.toString();
}

export function assertTrustedPolarCheckoutUrl(url: string) {
  const trimmedUrl = url.trim();
  let checkoutUrl: URL;
  try {
    checkoutUrl = new URL(trimmedUrl);
  } catch {
    throw new Error("Polar checkout URL không hợp lệ");
  }

  const isTrustedCheckoutUrl =
    checkoutUrl.protocol === "https:" &&
    checkoutUrl.username === "" &&
    checkoutUrl.password === "" &&
    checkoutUrl.port === "" &&
    checkoutUrl.hash === "" &&
    !isRawIpHostname(checkoutUrl.hostname) &&
    !isLocalOrPrivateHostname(checkoutUrl.hostname);
  if (!isTrustedCheckoutUrl) {
    throw new Error("Polar checkout URL phải là HTTPS public URL không kèm port/credentials/hash");
  }

  return checkoutUrl.toString();
}

export function normalizeBillingLocale(locale: string | undefined) {
  const trimmedLocale = locale?.trim();
  if (!trimmedLocale) {
    return null;
  }

  if (!/^[a-z]{2}(?:-[a-z]{2})?$/i.test(trimmedLocale)) {
    throw new Error("Billing locale không hợp lệ");
  }

  const [language, region] = trimmedLocale.split("-");
  return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase();
}

export function getDefaultBillingReturnUrl(siteUrl: string | undefined) {
  return new URL(billingReturnPath, getConfiguredSiteOrigin(siteUrl)).toString();
}
