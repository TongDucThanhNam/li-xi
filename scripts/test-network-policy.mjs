#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  isLocalOrPrivateHostname,
  isRawIpHostname,
  isRawIpv4Hostname,
  isRawIpv6Hostname,
  normalizeHostname,
} from "../lib/networkPolicy.ts";

assert.equal(normalizeHostname("LOCALHOST"), "localhost");
assert.equal(normalizeHostname("[::1]"), "::1");

for (const hostname of ["8.8.8.8", "10.0.0.1", "127.0.0.1", "999.1.1.1", "9999.1.1.1"]) {
  assert.equal(isRawIpv4Hostname(hostname), true, `${hostname} should be recognized as raw IPv4`);
  assert.equal(isRawIpHostname(hostname), true, `${hostname} should be recognized as raw IP`);
}

for (const hostname of ["2606:4700:4700::1111", "[fd00::1]", "::ffff:10.0.0.1"]) {
  assert.equal(isRawIpv6Hostname(hostname), true, `${hostname} should be recognized as raw IPv6`);
  assert.equal(isRawIpHostname(hostname), true, `${hostname} should be recognized as raw IP`);
}

for (const hostname of [
  "localhost",
  "app.localhost",
  "preview.local",
  "::",
  "::1",
  "fc00::1",
  "fd00::1",
  "fe80::1",
  "::ffff:10.0.0.1",
  "::ffff:not-ipv4",
  "0.0.0.0",
  "10.0.0.1",
  "127.0.0.1",
  "100.64.0.1",
  "169.254.1.1",
  "172.16.0.1",
  "192.0.0.1",
  "192.0.2.1",
  "192.168.0.1",
  "198.18.0.1",
  "198.51.100.1",
  "203.0.113.1",
  "224.0.0.1",
]) {
  assert.equal(
    isLocalOrPrivateHostname(hostname),
    true,
    `${hostname} should be recognized as local/private/reserved`
  );
}

for (const hostname of ["app.example.com", "checkout.polar.sh", "8.8.8.8", "2606:4700:4700::1111"]) {
  assert.equal(
    isLocalOrPrivateHostname(hostname),
    false,
    `${hostname} should not be classified as local/private/reserved by network range`
  );
}

assert.equal(isRawIpHostname("app.example.com"), false);

console.log("network policy regression tests passed");
