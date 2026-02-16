export const PIN_LENGTH = 6;
export const ENVELOPE_COUNT = 10;

export const MIN_OWNER_USERNAME_LENGTH = 3;
export const MAX_OWNER_USERNAME_LENGTH = 32;
export const MIN_GUEST_NAME_LENGTH = 2;
export const MAX_GUEST_NAME_LENGTH = 48;

export const RARITY_VALUES = ["common", "rare", "legend"] as const;
export type Rarity = (typeof RARITY_VALUES)[number];

export const RARITY_LABELS: Record<Rarity, string> = {
  common: "Common",
  rare: "Rare",
  legend: "Legend",
};

const OWNER_USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;
const PIN_RE = /^\d{6}$/;

export function normalizeOwnerUsername(username: string) {
  return username.trim().toLowerCase();
}

export function normalizeGuestName(guestName: string) {
  return guestName.trim().replace(/\s+/g, " ").toLowerCase();
}

export function sanitizeGuestName(guestName: string) {
  return guestName.trim().replace(/\s+/g, " ");
}

export function sanitizeOwnerUsername(username: string) {
  return username.trim();
}

export function isValidPin(pin: string) {
  return PIN_RE.test(pin);
}

export function validateOwnerUsername(username: string) {
  const sanitized = sanitizeOwnerUsername(username);
  if (sanitized.length < MIN_OWNER_USERNAME_LENGTH || sanitized.length > MAX_OWNER_USERNAME_LENGTH) {
    throw new Error(
      `Tên đăng nhập phải từ ${MIN_OWNER_USERNAME_LENGTH}-${MAX_OWNER_USERNAME_LENGTH} ký tự`
    );
  }
  if (!OWNER_USERNAME_RE.test(sanitized)) {
    throw new Error("Tên đăng nhập chỉ được chứa chữ, số, dấu gạch dưới, chấm hoặc gạch ngang");
  }
  return sanitized;
}

export function validateGuestName(guestName: string) {
  const sanitized = sanitizeGuestName(guestName);
  if (sanitized.length < MIN_GUEST_NAME_LENGTH || sanitized.length > MAX_GUEST_NAME_LENGTH) {
    throw new Error(
      `Tên người rút phải từ ${MIN_GUEST_NAME_LENGTH}-${MAX_GUEST_NAME_LENGTH} ký tự`
    );
  }
  return sanitized;
}

export function validatePin(pin: string) {
  if (!isValidPin(pin)) {
    throw new Error(`PIN phải gồm đúng ${PIN_LENGTH} chữ số`);
  }
  return pin;
}

export function isValidRarity(rarity: string): rarity is Rarity {
  return (RARITY_VALUES as readonly string[]).includes(rarity);
}

export function validateRarity(rarity: string): Rarity {
  if (!isValidRarity(rarity)) {
    throw new Error("Độ hiếm không hợp lệ");
  }
  return rarity;
}

export function validateWholePositiveNumber(value: number, fieldName: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} phải là số nguyên dương`);
  }
  return value;
}
