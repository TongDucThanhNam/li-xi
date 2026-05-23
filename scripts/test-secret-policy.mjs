#!/usr/bin/env node

import assert from "node:assert/strict";
import { hasProductionSecretShape, timingSafeEqual } from "../lib/secretPolicy.ts";

assert.equal(hasProductionSecretShape("prod_shared_secret_0123456789abcd"), true);
assert.equal(hasProductionSecretShape("short-secret"), false);
assert.equal(hasProductionSecretShape("placeholder"), false);
assert.equal(hasProductionSecretShape("prod shared secret 0123456789abcd"), false);
assert.equal(hasProductionSecretShape("<prod_shared_secret_0123456789abcd>"), false);
assert.equal(hasProductionSecretShape("your-token"), false);

assert.equal(timingSafeEqual("prod_shared_secret_0123456789abcd", "prod_shared_secret_0123456789abcd"), true);
assert.equal(timingSafeEqual("prod_shared_secret_0123456789abcd", "prod_shared_secret_0123456789abce"), false);
assert.equal(timingSafeEqual("prod_shared_secret_0123456789abcd", "prod_shared_secret_0123456789abcdx"), false);
assert.equal(timingSafeEqual(undefined, "prod_shared_secret_0123456789abcd"), false);

console.log("secret policy regression tests passed");
