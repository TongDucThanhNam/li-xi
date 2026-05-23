const placeholderSecretValues = new Set([
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

export function hasProductionSecretShape(value: string | undefined, minLength = 32) {
  const secret = value?.trim();
  return Boolean(
    secret &&
      secret.length >= minLength &&
      !/\s/.test(secret) &&
      !/[<>]/.test(secret) &&
      !placeholderSecretValues.has(secret.toLowerCase())
  );
}

export function timingSafeEqual(left: string | undefined, right: string | undefined) {
  const leftValue = left ?? "";
  const rightValue = right ?? "";
  const maxLength = Math.max(leftValue.length, rightValue.length);
  let mismatch = leftValue.length ^ rightValue.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (leftValue.charCodeAt(index) || 0) ^ (rightValue.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}
