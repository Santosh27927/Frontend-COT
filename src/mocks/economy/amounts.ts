import type { Asset } from "../policy/catalog.ts";
import { quantityStep } from "../policy/catalog.ts";
import type { Wallet } from "../market/execution.ts";
import {
  parseUnits,
  quantity,
  cash,
  qty,
  checked,
  format,
} from "../market/exact.ts";
import { getPolicy } from "../policy/service.ts";
export type Fraction = { n: bigint; d: bigint };
export function fraction(n: bigint, d = 1n): Fraction {
  if (d <= 0n) throw Error("Invalid denominator");
  let a = n < 0n ? -n : n,
    b = d;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return { n: n / (a || 1n), d: d / (a || 1n) };
}
export const add = (a: Fraction, b: Fraction) =>
  fraction(a.n * b.d + b.n * a.d, a.d * b.d);
export const subtract = (a: Fraction, b: Fraction) =>
  add(a, fraction(-b.n, b.d));
export const less = (a: Fraction, b: Fraction) => a.n * b.d < b.n * a.d;
export const atom = (a: Asset, v: string) =>
  a === "USD" ? parseUnits(v, 12, false) : quantity(v, a, false);
export const display = (a: Asset, n: bigint) =>
  a === "USD" ? cash(n) : qty(n);
export const step = (a: Asset) => (a === "USD" ? 1n : quantityStep(a));
export const balance = (w: Wallet, a: Asset) =>
  a === "USD" ? w.cash : w.quantities[a];
export function setBalance(w: Wallet, a: Asset, n: bigint) {
  checked(n);
  if (n < 0n) throw Error("Negative wallet");
  if (a === "USD") w.cash = n;
  else w.quantities[a] = n;
}
export function room(w: Wallet, a: Asset) {
  const cap = getPolicy().walletCaps[a];
  return cap === null
    ? 9223372036854775807n - balance(w, a)
    : max(0n, atom(a, cap) - balance(w, a));
}
export const max = (a: bigint, b: bigint) => (a > b ? a : b);
export const min = (a: bigint, b: bigint) => (a < b ? a : b);
export const whole = (f: Fraction, a: Asset) => (f.n / f.d / step(a)) * step(a);

/** Exact player-facing entitlement, including units too small for the wallet. */
export function entitlementText(asset: Asset, value: Fraction): string {
  const units = fraction(
    value.n,
    value.d * 10n ** BigInt(asset === "USD" ? 12 : 8),
  );
  let denominator = units.d,
    twos = 0,
    fives = 0;
  while (denominator % 2n === 0n) {
    denominator /= 2n;
    twos++;
  }
  while (denominator % 5n === 0n) {
    denominator /= 5n;
    fives++;
  }
  if (denominator !== 1n) return `${units.n}/${units.d} ${asset}`;
  const places = Math.max(twos, fives);
  if (!places) return `${units.n} ${asset}`;
  return `${format((units.n * 10n ** BigInt(places)) / units.d, places)} ${asset}`;
}
export function ratioLabel(n: number, d: number): string {
  const scaled = BigInt(n) * 1000000n,
    den = BigInt(d);
  return scaled % den === 0n
    ? `${format(scaled / den, 4)}%`
    : `${n}/${d} of base`;
}
