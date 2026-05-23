#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  configuredMigrationToken,
  configuredMigrationTokenName,
  isConfiguredMigrationTokenProductionSafe,
  isMigrationTokenConfigured,
  isValidMigrationToken,
  migrationTokenEnvNames,
} from "../lib/migrationTokenPolicy.ts";

const originalEnv = new Map(
  migrationTokenEnvNames.map((name) => [name, process.env[name]])
);

function withMigrationTokenEnv(env, fn) {
  for (const name of migrationTokenEnvNames) {
    if (Object.prototype.hasOwnProperty.call(env, name)) {
      process.env[name] = env[name];
    } else {
      delete process.env[name];
    }
  }

  try {
    fn();
  } finally {
    for (const [name, value] of originalEnv) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

withMigrationTokenEnv({}, () => {
  assert.equal(configuredMigrationTokenName(), null);
  assert.equal(configuredMigrationToken(), null);
  assert.equal(isMigrationTokenConfigured(), false);
  assert.equal(isConfiguredMigrationTokenProductionSafe(), false);
  assert.equal(isValidMigrationToken("prod_migration_secret_0123456789abcd"), false);
});

withMigrationTokenEnv({ LI_XI_MIGRATION_TOKEN: "   " }, () => {
  assert.equal(configuredMigrationTokenName(), "LI_XI_MIGRATION_TOKEN");
  assert.equal(configuredMigrationToken(), "");
  assert.equal(isMigrationTokenConfigured(), true);
  assert.equal(isConfiguredMigrationTokenProductionSafe(), false);
  assert.equal(isValidMigrationToken(""), false);
});

withMigrationTokenEnv({ LIXI_MIGRATION_TOKEN: "placeholder" }, () => {
  assert.equal(configuredMigrationTokenName(), "LIXI_MIGRATION_TOKEN");
  assert.equal(isMigrationTokenConfigured(), true);
  assert.equal(isConfiguredMigrationTokenProductionSafe(), false);
  assert.equal(isValidMigrationToken("placeholder"), false);
});

withMigrationTokenEnv(
  { LI_XI_MIGRATION_TOKEN: " prod_migration_secret_0123456789abcd " },
  () => {
    assert.equal(configuredMigrationTokenName(), "LI_XI_MIGRATION_TOKEN");
    assert.equal(configuredMigrationToken(), "prod_migration_secret_0123456789abcd");
    assert.equal(isMigrationTokenConfigured(), true);
    assert.equal(isConfiguredMigrationTokenProductionSafe(), true);
    assert.equal(isValidMigrationToken("prod_migration_secret_0123456789abcd"), true);
    assert.equal(isValidMigrationToken("prod_migration_secret_0123456789abce"), false);
  }
);

console.log("migration token policy regression tests passed");
