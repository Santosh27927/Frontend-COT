import { DemoError } from "../errors.ts";
import type { Symbol } from "../../api/market-types.ts";
import { ASSET_RULES, alignQuantity } from "../policy/catalog.ts";
export const UNIT = 1000000n; // price scale
export const QTY_UNIT = 100000000n;
export const CASH_UNIT = 1000000000000n;
export const MAX = 9223372036854775807n;
export function invalid(
  message = "Use a supported positive decimal amount.",
): never {
  throw new DemoError("INVALID_COMMAND", message);
}
export function checked(value: bigint): bigint {
  if (value < -MAX || value > MAX)
    invalid("This value exceeds the supported exact numeric range.");
  return value;
}
export function parseUnits(
  value: unknown,
  places: number,
  positive = true,
): bigint {
  if (
    typeof value !== "string" ||
    value.length > 30 ||
    !new RegExp(`^(0|[1-9][0-9]*)(\\.[0-9]{1,${places}})?$`).test(value)
  )
    invalid(`Use up to ${places} decimal places.`);
  const [whole, fraction = ""] = value.split(".");
  const n = checked(
    BigInt(whole) * 10n ** BigInt(places) +
      BigInt(fraction.padEnd(places, "0")),
  );
  if (positive && n <= 0n) invalid();
  return n;
}
export const decimal = (v: unknown, positive = true) =>
  parseUnits(v, 6, positive);
export function quantity(v: unknown, symbol?: Symbol, positive = true) {
  const q = parseUnits(v, 8, positive);
  if (symbol && alignQuantity(q, symbol) !== q)
    invalid(
      `${symbol} quantities support ${ASSET_RULES[symbol].quantityDecimals} decimal places.`,
    );
  return q;
}
export function price(v: unknown, symbol: Symbol) {
  parseUnits(v, ASSET_RULES[symbol].priceDecimals);
  return decimal(v);
}
export function format(value: bigint, places = 6, minPlaces = 0): string {
  const sign = value < 0n ? "-" : "";
  const raw = (value < 0n ? -value : value)
    .toString()
    .padStart(places + 1, "0");
  const fraction = raw.slice(-places).replace(/0+$/, "").padEnd(minPlaces, "0");
  return sign + raw.slice(0, -places) + (fraction ? "." + fraction : "");
}
export const qty = (v: bigint) => format(v, 8);
export const cash = (v: bigint) => format(v, 12, 2);
export function product(q: bigint, p: bigint) {
  const raw = q * p;
  if (raw % 100n)
    invalid(
      "This quantity and price exceed the supported exact cash precision.",
    );
  return checked(raw / 100n);
}
export const quantityForCash = (c: bigint, p: bigint, symbol?: Symbol) => {
  const q = (c * 100n) / p;
  return symbol ? alignQuantity(q, symbol) : q;
};
export const priceForNotional = (c: bigint, q: bigint) => (c * 100n) / q;
