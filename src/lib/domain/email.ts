export function normalizeRequesterEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidRequesterEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeRequesterEmail(value));
}
