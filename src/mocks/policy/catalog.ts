import type { Symbol } from "../../api/market-types.ts";
export type Asset = Symbol | "USD";
/** Structural service metadata. Precision changes require an explicit migration. */
export const ASSET_RULES = {
  USD: { quantityDecimals: 12, priceDecimals: 0, label: "Demo USD" },
  ETC: { quantityDecimals: 6, priceDecimals: 6, label: "ETC" },
  SOL: { quantityDecimals: 6, priceDecimals: 6, label: "SOL" },
  BTC: { quantityDecimals: 8, priceDecimals: 4, label: "BTC" },
} as const;
export const ASSETS: Asset[] = ["USD", "ETC", "SOL", "BTC"];
export const COLLECTORS: Symbol[] = ["ETC", "BTC"];
export const quantityStep = (symbol: Symbol) =>
  10n ** BigInt(8 - ASSET_RULES[symbol].quantityDecimals);
export const priceStep = (symbol: Symbol) =>
  10n ** BigInt(6 - ASSET_RULES[symbol].priceDecimals);
export const alignQuantity = (q: bigint, symbol: Symbol) =>
  q - (q % quantityStep(symbol));
export const alignPrice = (p: bigint, symbol: Symbol) =>
  p - (p % priceStep(symbol));
