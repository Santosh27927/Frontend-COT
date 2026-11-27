/** Historical COT scripted prices (pre-phase-5 checkpoint), kept as independent
 * timing/PnL oracles. Only asset labels adopt the approved ETC/BTC catalog.
 * These are TEST inputs; production default prices and current marks are tested separately. */
import { ALL_SCENARIOS as catalog } from "./course.ts";
import type { Scenario } from "./scenarios.ts";
import { MarketBook } from "./book.ts";
const frames = {
  ETC: [2000000n, 2100000n, 1950000n, 1800000n, 2200000n, 1600000n, 2050000n],
  SOL: [
    100000000n,
    105000000n,
    97500000n,
    90000000n,
    110000000n,
    80000000n,
    102500000n,
  ],
  BTC: [
    2000000000n,
    2100000000n,
    1950000000n,
    1800000000n,
    2200000000n,
    1600000000n,
    2050000000n,
  ],
};
export const ALL_SCENARIOS: Scenario[] = catalog.map((s) => {
  const indices =
    s.recommendedAsset === "SOL"
      ? [6, 5, 4, 3, 2, 1, 0]
      : s.recommendedAsset === "BTC"
        ? [0, 1, 3, 4, 5, 6, 2]
        : [0, 1, 2, 3, 4, 5, 6];
  return {
    ...structuredClone(s),
    frames: {
      ETC: indices.map((i) => frames.ETC[i]),
      SOL: indices.map((i) => frames.SOL[i]),
      BTC: indices.map((i) => frames.BTC[i]),
    },
  };
});
export const SCENARIOS = ALL_SCENARIOS.filter((s) => s.lessonId === "market");
/** Place a prerequisite-completed book at a deliberately fixed test quote.
 * Real player progression never resets its marks; all-36 journey tests cover that. */
export function fixedMarks(book: MarketBook) {
  const d = book.dump();
  d.marks = { ETC: 2000000n, SOL: 100000000n, BTC: 2000000000n };
  book.restore(d);
}
