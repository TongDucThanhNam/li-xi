#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  assertPublicClaimPath,
  buildPublicAppUrlFromOrigin,
  normalizePublicClaimCode,
  parseCleanPublicAppOrigin,
} from "../lib/publicAppUrlPolicy.ts";

assert.equal(parseCleanPublicAppOrigin(undefined), null);
assert.equal(parseCleanPublicAppOrigin(""), null);
assert.equal(parseCleanPublicAppOrigin("https://app.example.com"), "https://app.example.com");
assert.equal(parseCleanPublicAppOrigin("https://app.example.com/"), "https://app.example.com");
assert.equal(parseCleanPublicAppOrigin("  https://app.example.com/  "), "https://app.example.com");
assert.equal(parseCleanPublicAppOrigin("http://localhost:3000"), "http://localhost:3000");
assert.equal(parseCleanPublicAppOrigin("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
assert.equal(parseCleanPublicAppOrigin("https://127.0.0.1"), "https://127.0.0.1");
assert.equal(parseCleanPublicAppOrigin("https://[::1]:3000"), "https://[::1]:3000");

for (const value of [
  "http://app.example.com",
  "https://app.example.com/campaigns",
  "https://app.example.com?checkout=success",
  "https://app.example.com#claim",
  "https://app.example.com:8443",
  "https://user:pass@app.example.com",
  "https://app.localhost",
  "https://preview.local",
  "https://10.0.0.1",
  "https://[fd00::1]",
  "not a url",
]) {
  assert.equal(parseCleanPublicAppOrigin(value), null, `${value} should not be a clean public app origin`);
}

assert.equal(
  buildPublicAppUrlFromOrigin("/claim/abc123", "https://app.example.com"),
  "https://app.example.com/claim/abc123"
);
assert.equal(
  buildPublicAppUrlFromOrigin("/campaigns?checkout=success#billing", "https://app.example.com"),
  "https://app.example.com/campaigns?checkout=success#billing"
);
assert.equal(
  buildPublicAppUrlFromOrigin("/claim/abc123", ""),
  "/claim/abc123"
);
assert.throws(
  () => buildPublicAppUrlFromOrigin("https://evil.example.com/claim/abc123", "https://app.example.com"),
  /Public app URL path must be root-relative/,
  "absolute URLs must not override the trusted public app origin"
);
assert.throws(
  () => buildPublicAppUrlFromOrigin("//evil.example.com/claim/abc123", "https://app.example.com"),
  /Public app URL path must be root-relative/,
  "scheme-relative URLs must not override the trusted public app origin"
);
assert.throws(
  () => buildPublicAppUrlFromOrigin("claim/abc123", "https://app.example.com"),
  /Public app URL path must be root-relative/,
  "relative paths without a leading slash should be rejected to avoid ambiguous URL construction"
);

assert.equal(assertPublicClaimPath("/claim/abcdefabcdefabcdefabcdef"), "/claim/abcdefabcdefabcdefabcdef");
assert.equal(normalizePublicClaimCode("ABCDEFABCDEFABCDEFABCDEF"), "abcdefabcdefabcdefabcdef");
assert.equal(normalizePublicClaimCode(" abcdefabcdefabcdefabcdef "), "abcdefabcdefabcdefabcdef");
for (const value of [
  "/claim/ABCDEFABCDEFABCDEFABCDEF",
  "/claim/abcdefabcdefabcdefabcde",
  "/claim/abcdefabcdefabcdefabcdef?utm=1",
  "/claim/abcdefabcdefabcdefabcdef#result",
  "/draw/abcdefabcdefabcdefabcdef",
  "//evil.example.com/claim/abcdefabcdefabcdefabcdef",
]) {
  assert.throws(
    () => assertPublicClaimPath(value),
    /Public claim URL path must be \/claim\/<24-character lowercase hex code>/,
    `${value} should not be accepted as a public claim path`
  );
}

for (const value of [
  "abcdefabcdefabcdefabcde",
  "abcdefabcdefabcdefabcdef?utm=1",
  "claim-abcdefabcdefabcdefabcdef",
]) {
  assert.equal(normalizePublicClaimCode(value), null, `${value} should not normalize as a public claim code`);
}

console.log("public app URL policy regression tests passed");
