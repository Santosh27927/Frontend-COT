export function usernameError(value: unknown): string | null {
  if (typeof value !== "string" || !value) return "Enter your account name.";
  if (!/^[a-z]+$/.test(value))
    return "Only lowercase account names (a–z) are accepted.";
  if (value.length > 10) return "Use no more than 10 lowercase letters.";
  return null;
}
export function pinError(value: unknown): string | null {
  if (typeof value === "string" && /[^0-9]/.test(value))
    return "Only numbers from 0 to 9 are allowed.";
  return typeof value === "string" && /^[0-9]{4}$/.test(value)
    ? null
    : "Enter your four-digit PIN.";
}
