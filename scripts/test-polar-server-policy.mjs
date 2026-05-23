#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  normalizeConfiguredPolarServer,
  resolvePolarServer,
} from "../lib/polarServerPolicy.ts";

assert.equal(normalizeConfiguredPolarServer(undefined), null);
assert.equal(normalizeConfiguredPolarServer("   "), null);
assert.equal(normalizeConfiguredPolarServer(" production "), "production");

assert.equal(resolvePolarServer(undefined), "sandbox");
assert.equal(resolvePolarServer(""), "sandbox");
assert.equal(resolvePolarServer(" sandbox "), "sandbox");
assert.equal(resolvePolarServer("production"), "production");
assert.throws(
  () => resolvePolarServer("prodution"),
  /sandbox hoặc production/,
  "POLAR_SERVER typos should fail closed instead of silently downgrading to sandbox"
);
assert.throws(
  () => resolvePolarServer("Production"),
  /sandbox hoặc production/,
  "POLAR_SERVER should be explicit and case-sensitive"
);

console.log("polar server policy regression tests passed");
