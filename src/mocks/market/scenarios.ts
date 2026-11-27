import type { Symbol } from "../../api/market-types.ts";
import { alignPrice } from "../policy/catalog.ts";
import { getPolicy } from "../policy/service.ts";
import { decimal } from "./exact.ts";
export const SYMBOLS: Symbol[] = ["ETC", "SOL", "BTC"];
export type Scenario = {
  timing?: {
    durationSeconds: number;
    fillSeconds: number;
    triggerSeconds: number;
    reviewSeconds: number;
  };
  id: string;
  lessonId?: import("../../api/market-types.ts").LessonId;
  title: string;
  recommendedAsset: Symbol;
  defaultQuantity: string;
  frames: Record<Symbol, bigint[]>;
};
// Private teaching fixtures, adapted from existing COT spot script values.
// These are proposed example paths, not live quotes or approved economic prices.
const factors = [10000n, 10500n, 9750n, 9000n, 11000n, 8000n, 10250n];
const prices = Object.fromEntries(
  SYMBOLS.map((symbol) => [
    symbol,
    factors.map((f) =>
      alignPrice(
        (decimal(getPolicy().marketSeeds[symbol]) * f) / 10000n,
        symbol,
      ),
    ),
  ]),
) as Record<Symbol, bigint[]>;
export const SCENARIOS: Scenario[] = [
  {
    id: "market-etc",
    title: "First trade · a changing market",
    recommendedAsset: "ETC",
    defaultQuantity: "5",
    indices: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    id: "market-sol",
    title: "Second view · a different path",
    recommendedAsset: "SOL",
    defaultQuantity: "1",
    indices: [6, 5, 4, 3, 2, 1, 0],
  },
  {
    id: "market-btc",
    title: "Third view · ending lower",
    recommendedAsset: "BTC",
    defaultQuantity: "0.001",
    indices: [0, 1, 3, 4, 5, 6, 2],
  },
].map(({ indices, ...s }) => ({
  ...s,
  frames: Object.fromEntries(
    SYMBOLS.map((symbol) => [symbol, indices.map((i) => prices[symbol][i])]),
  ) as Record<Symbol, bigint[]>,
})) as Scenario[];

/** Freeze this policy into each accepted real/practice scenario. */
export function timing(s: Scenario) {
  const t = s.timing ?? getPolicy().learning;
  return {
    duration: t.durationSeconds * 1000,
    fill: t.fillSeconds * 1000,
    trigger: t.triggerSeconds * 1000,
    review: t.reviewSeconds * 1000,
    frame: (t.durationSeconds * 1000) / 6,
  };
}
