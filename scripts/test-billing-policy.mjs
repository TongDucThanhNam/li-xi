#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  assertConfiguredBillingProductId,
  assertConfiguredCheckoutProductIds,
  assertTrustedBillingOrigin,
  assertTrustedBillingUrl,
  assertTrustedPolarCheckoutUrl,
  getDefaultBillingReturnUrl,
  isLocalOrPrivateHostname,
  isRawIpHostname,
  normalizeBillingLocale,
  parseCleanOrigin,
} from "../lib/billingPolicy.ts";

const products = {
  pro: "prod_pro",
  business: "prod_business",
};
const siteUrl = "https://app.example.com";

assert.equal(assertConfiguredBillingProductId(" prod_pro ", products), "prod_pro");
assert.deepEqual(assertConfiguredCheckoutProductIds(["prod_business"], products), ["prod_business"]);
assert.throws(
  () => assertConfiguredCheckoutProductIds(["prod_pro", "prod_business"], products),
  /Checkout chỉ hỗ trợ một gói/
);
assert.throws(
  () => assertConfiguredBillingProductId("prod_unknown", products),
  /Polar product không thuộc cấu hình/
);
assert.throws(
  () => assertConfiguredBillingProductId("prod_pro", { pro: "prod_same", business: "prod_same" }),
  /phải khác nhau/
);
assert.throws(
  () => assertConfiguredBillingProductId("prod_pro", { pro: "prod_pro", business: "" }),
  /Cần cấu hình đủ/
);
assert.throws(
  () => assertConfiguredBillingProductId("prod_pro", { pro: "prod_pro", business: "   " }),
  /Cần cấu hình đủ/,
  "blank configured Polar product ids should fail after trimming"
);
assert.throws(
  () => assertConfiguredBillingProductId("prod_pro", { pro: "prod_pro", business: "prod bad" }),
  /Cần cấu hình đủ/,
  "configured Polar product ids with whitespace should fail closed"
);

assert.equal(parseCleanOrigin("https://app.example.com/", "SITE_URL"), siteUrl);
assert.equal(assertTrustedBillingOrigin("https://app.example.com", siteUrl), siteUrl);
assert.throws(
  () => assertTrustedBillingOrigin("https://app.example.com:443", siteUrl),
  /HTTPS public origin/,
  "billing origins should reject explicit default ports before sending URLs to Polar"
);
assert.equal(
  assertTrustedBillingUrl("https://app.example.com/campaigns?checkout=success", "Billing successUrl", siteUrl),
  "https://app.example.com/campaigns?checkout=success"
);
assert.equal(
  assertTrustedPolarCheckoutUrl("https://checkout.polar.sh/checkout/session_123?customer_session=abc"),
  "https://checkout.polar.sh/checkout/session_123?customer_session=abc"
);
assert.throws(
  () => assertTrustedPolarCheckoutUrl("http://checkout.polar.sh/checkout/session_123"),
  /HTTPS public URL/,
  "Polar checkout URL returned to the browser should never downgrade to HTTP"
);
assert.throws(
  () => assertTrustedPolarCheckoutUrl("https://user:pass@checkout.polar.sh/checkout/session_123"),
  /HTTPS public URL/,
  "Polar checkout URL returned to the browser should not include embedded credentials"
);
assert.throws(
  () => assertTrustedPolarCheckoutUrl("https://checkout.polar.sh:8443/checkout/session_123"),
  /HTTPS public URL/,
  "Polar checkout URL returned to the browser should not include custom ports"
);
assert.throws(
  () => assertTrustedPolarCheckoutUrl("https://localhost/checkout/session_123"),
  /HTTPS public URL/,
  "Polar checkout URL returned to the browser should not point at local hosts"
);
assert.throws(
  () => assertTrustedPolarCheckoutUrl("https://8.8.8.8/checkout/session_123"),
  /HTTPS public URL/,
  "Polar checkout URL returned to the browser should not use raw IP hosts"
);
assert.throws(
  () => assertTrustedBillingUrl("https://app.example.com/campaigns?next=/draw", "Billing successUrl", siteUrl),
  /query billing hợp lệ/,
  "billing redirects should not carry arbitrary query params to or from Polar"
);
assert.throws(
  () => assertTrustedBillingUrl("https://app.example.com/campaigns?checkout=cancelled", "Billing successUrl", siteUrl),
  /query billing hợp lệ/,
  "billing checkout result query should be constrained to known values"
);
assert.throws(
  () =>
    assertTrustedBillingUrl(
      "https://app.example.com/campaigns?checkout=success&next=/draw",
      "Billing successUrl",
      siteUrl
    ),
  /query billing hợp lệ/,
  "billing redirects should not mix allowed checkout result with extra params"
);
assert.equal(getDefaultBillingReturnUrl(siteUrl), "https://app.example.com/campaigns");
assert.throws(
  () => assertTrustedBillingUrl("https://app.example.com/draw?checkout=success", "Billing successUrl", siteUrl),
  /route billing hợp lệ/,
  "billing redirects should be constrained to the Campaign Studio billing return route"
);
assert.throws(
  () => assertTrustedBillingOrigin("https://billing.example.com", siteUrl),
  /Billing origin không khớp SITE_URL/
);
assert.throws(
  () => parseCleanOrigin("https://app.example.com/path", "SITE_URL"),
  /không kèm path/
);
assert.throws(
  () => assertTrustedBillingUrl("http://app.example.com/campaigns", "Billing returnUrl", siteUrl),
  /HTTPS public URL/
);
assert.throws(
  () => assertTrustedBillingUrl("https://user:pass@app.example.com/campaigns", "Billing returnUrl", siteUrl),
  /HTTPS public URL/
);
assert.throws(
  () => assertTrustedBillingUrl("https://app.example.com:8443/campaigns", "Billing returnUrl", siteUrl),
  /HTTPS public URL/
);
assert.throws(
  () => assertTrustedBillingUrl("https://app.example.com:443/campaigns", "Billing returnUrl", siteUrl),
  /URL canonical/,
  "billing redirects should reject explicit default ports before sending URLs to Polar"
);
assert.throws(
  () => assertTrustedBillingUrl("https://app.example.com/campaigns#checkout", "Billing returnUrl", siteUrl),
  /HTTPS public URL/,
  "billing redirects should reject fragments before sending URLs to Polar"
);
assert.throws(
  () => assertTrustedBillingUrl("https://localhost/campaigns", "Billing returnUrl", siteUrl),
  /HTTPS public URL/
);
assert.throws(
  () => assertTrustedBillingUrl("https://100.64.0.1/campaigns", "Billing returnUrl", siteUrl),
  /HTTPS public URL/
);
assert.throws(
  () => assertTrustedBillingUrl("https://[fd00::1]/campaigns", "Billing returnUrl", siteUrl),
  /HTTPS public URL/
);
assert.throws(
  () => parseCleanOrigin("https://8.8.8.8", "SITE_URL"),
  /HTTPS public origin/
);
assert.throws(
  () => assertTrustedBillingUrl("https://8.8.8.8/campaigns", "Billing returnUrl", "https://8.8.8.8"),
  /HTTPS public URL/
);
assert.throws(
  () => parseCleanOrigin("https://[2606:4700:4700::1111]", "SITE_URL"),
  /HTTPS public origin/
);
assert.throws(
  () =>
    assertTrustedBillingUrl(
      "https://[2606:4700:4700::1111]/campaigns",
      "Billing returnUrl",
      "https://[2606:4700:4700::1111]"
    ),
  /HTTPS public URL/
);
assert.equal(isLocalOrPrivateHostname("::ffff:10.0.0.1"), true);
assert.equal(isLocalOrPrivateHostname("app.example.com"), false);
assert.equal(isRawIpHostname("8.8.8.8"), true);
assert.equal(isRawIpHostname("2606:4700:4700::1111"), true);
assert.equal(isRawIpHostname("app.example.com"), false);

assert.equal(normalizeBillingLocale(undefined), null);
assert.equal(normalizeBillingLocale(" vi-vn "), "vi-VN");
assert.equal(normalizeBillingLocale("EN"), "en");
assert.throws(() => normalizeBillingLocale("vi_VN"), /Billing locale không hợp lệ/);
assert.throws(() => normalizeBillingLocale("vietnamese"), /Billing locale không hợp lệ/);

console.log("billing policy regression tests passed");
