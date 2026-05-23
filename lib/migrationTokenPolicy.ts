export const migrationTokenEnvNames = [
  "LI_XI_MIGRATION_TOKEN",
  "LIXI_MIGRATION_TOKEN",
] as const;

const placeholderMigrationTokenValues = new Set([
  "changeme",
  "change-me",
  "example",
  "placeholder",
  "secret",
  "todo",
  "token",
  "your-secret",
  "your-token",
]);

function hasProductionSecretShape(value: string | undefined, minLength = 32) {
  const secret = value?.trim();
  return Boolean(
    secret &&
      secret.length >= minLength &&
      !/\s/.test(secret) &&
      !/[<>]/.test(secret) &&
      !placeholderMigrationTokenValues.has(secret.toLowerCase())
  );
}

function timingSafeEqual(left: string | undefined, right: string | undefined) {
  const leftValue = left ?? "";
  const rightValue = right ?? "";
  const maxLength = Math.max(leftValue.length, rightValue.length);
  let mismatch = leftValue.length ^ rightValue.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (leftValue.charCodeAt(index) || 0) ^ (rightValue.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

export function configuredMigrationTokenName(env: NodeJS.ProcessEnv = process.env) {
  return migrationTokenEnvNames.find((name) => env[name] !== undefined) ?? null;
}

export function configuredMigrationToken(env: NodeJS.ProcessEnv = process.env) {
  const name = configuredMigrationTokenName(env);
  return name ? env[name]?.trim() ?? null : null;
}

export function isMigrationTokenConfigured(env: NodeJS.ProcessEnv = process.env) {
  return configuredMigrationTokenName(env) !== null;
}

export function isConfiguredMigrationTokenProductionSafe(env: NodeJS.ProcessEnv = process.env) {
  return hasProductionSecretShape(configuredMigrationToken(env) ?? undefined);
}

export function isValidMigrationToken(value: string | undefined, env: NodeJS.ProcessEnv = process.env) {
  const token = configuredMigrationToken(env);
  return Boolean(
    token &&
      isConfiguredMigrationTokenProductionSafe(env) &&
      timingSafeEqual(value?.trim(), token)
  );
}
