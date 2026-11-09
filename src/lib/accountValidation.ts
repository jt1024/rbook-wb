export const USERNAME_RE = /^[a-z0-9_.-]{3,40}$/;
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
export const ROLES = ["owner", "admin", "editor"] as const;

export function normalizeUsername(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().slice(0, 40);
}

export function normalizePassword(value: unknown): string {
  return String(value ?? "").slice(0, MAX_PASSWORD_LENGTH);
}

export function validPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}

export function normalizeDisplayName(value: unknown): string {
  return String(value ?? "").trim().slice(0, 40);
}
