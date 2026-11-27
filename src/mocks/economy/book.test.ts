import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketBook } from "../market/book.ts";
import { EconomyBook } from "./book.ts";
import { ResourceBook } from "../resources/book.ts";
import { ALL_SCENARIOS } from "../market/course.ts";
import { DemoError } from "../errors.ts";
import { cash, parseUnits, quantity, price, product } from "../market/exact.ts";
import { fraction } from "./amounts.ts";
import type { Asset, EconomyCommand } from "../../api/economy-types.ts";
const HOUR = 3600000;
const err = (f: () => unknown, code: string) =>
  assert.throws(f, (e) => e instanceof DemoError && e.code === code);
/** Contract fixtures from approved phase5–11 decisions. This directly prepares a
 * domain aggregate for boundary tests; it is not a player API or grant endpoint. */
function fixture(
  options: {
    spot?: boolean;
    all?: boolean;
    assistance?: boolean;
    cash?: string;
    etc?: string;
    btc?: string;
    sol?: string;
  } = {},
) {
  let now = 0,
    seq = 0;
  const b = new MarketBook(() => now),
    d = b.dump();
  d.wallet.cash = parseUnits(options.cash ?? "1000", 12, false);
  d.wallet.quantities = {
    ETC: quantity(options.etc ?? "0", "ETC", false),
    SOL: quantity(options.sol ?? "0", "SOL", false),
    BTC: quantity(options.btc ?? "0", "BTC", false),
  };
  if (options.spot !== false)
    d.passed = new Set(
      ALL_SCENARIOS.filter(
        (s) =>
          options.all ||
          ["market", "gtc", "ioc-fok", "stop-limit"].includes(s.lessonId!),
      ).map((s) => s.id),
    );
  const r = new ResourceBook(() => now);
  if (options.spot !== false) {
    r.award("ETC", now);
    r.award("BTC", now);
  }
  d.resources = r.dump();
  b.restore(d);
  const e = new EconomyBook(b, () => now, options.assistance ?? false);
  const command = (c: Record<string, unknown>) => {
    const state = e.state();
    return e.command({
      ...c,
      ...(c.action === "answer" && !("questionRevision" in c)
        ? {
            questionRevision: state.questions.find((q) => q.id === c.questionId)
              ?.revision,
          }
        : {}),
      ...(c.action === "claim-assistance" && !("offerId" in c)
        ? { offerId: state.assistance.offerId ?? "no-offer" }
        : {}),
      intentId: `economy-test-${++seq}`,
    });
  };
  const row = (a: Asset) => e.state().wallet.find((x) => x.asset === a)!;
  const mark = (a: "ETC" | "SOL" | "BTC", v: string) => {
    const d = b.dump();
    d.marks[a] = price(v, a);
    b.restore(d);
  };
  return {
    b,
    e,
    row,
    command,
    mark,
    time: (t: number) => {
      now = t;
    },
    now: () => now,
  };
}
test("E01: two collectors and fixed wallet caps; BTC has no gameplay wallet limit", () => {
  const f = fixture();
  const s = f.e.state();
  assert.deepEqual(
    s.wallet.map((w) => [w.asset, w.capacity]),
    [
      ["USD", "2000"],
      ["ETC", "350"],
      ["SOL", "20"],
      ["BTC", null],
    ],
  );
  assert.deepEqual(
    f.b.state().generators.map((g) => [g.asset, g.ratePerHour, g.capacity]),
    [
      ["ETC", "1", "50"],
      ["BTC", "0.0001", "0.005"],
    ],
  );
  assert.equal(s.learningLevel, 2);
  assert.equal(s.converter.available, true);
  assert.equal(s.townHallLevel, 1);
  const locked = fixture({ spot: false });
  assert.equal(locked.e.state().converter.unlocked, false);
  err(
    () =>
      locked.e.quote({ kind: "conversion", source: "USD", destination: "BTC" }),
    "CONVERTER_LOCKED",
  );
});
test("E02: fixed $50 source, zero fee, 25% bonus, no amount override and same-asset rejection", () => {
  const f = fixture();
  f.mark("ETC", "5");
  const before = f.row("USD").balance;
  err(
    () =>
      f.e.quote({
        kind: "conversion",
        source: "USD",
        destination: "ETC",
        amount: "1",
      }),
    "INVALID_COMMAND",
  );
  for (const source of ["USD", "ETC", "SOL", "BTC"] as const)
    err(
      () => f.e.quote({ kind: "conversion", source, destination: source }),
      "INVALID_CONVERSION",
    );
  assert.equal(f.row("USD").balance, before);
  const q = f.e.quote({
    kind: "conversion",
    source: "USD",
    destination: "ETC",
  });
  assert.equal(f.row("USD").balance, "1000.00");
  f.command({ action: "convert", quoteId: q.id });
  assert.equal(f.row("USD").balance, "950.00");
  assert.equal(f.row("ETC").balance, "12.5");
  assert.equal(f.e.state().converter.nextAt, new Date(48 * HOUR).toISOString());
});
test("E03: all conversions blocked until exactly 48h; failed previews do not start cooldown", () => {
  const f = fixture({ etc: "100" });
  f.mark("ETC", "5");
  const q = f.e.quote({
    kind: "conversion",
    source: "ETC",
    destination: "USD",
  });
  f.command({ action: "convert", quoteId: q.id });
  for (const [source, destination] of [
    ["USD", "BTC"],
    ["BTC", "ETC"],
    ["ETC", "SOL"],
  ] as const)
    err(
      () => f.e.quote({ kind: "conversion", source, destination }),
      "CONVERSION_COOLDOWN",
    );
  f.time(48 * HOUR - 1);
  err(
    () => f.e.quote({ kind: "conversion", source: "USD", destination: "BTC" }),
    "CONVERSION_COOLDOWN",
  );
  f.time(48 * HOUR);
  assert.ok(
    f.e.quote({ kind: "conversion", source: "USD", destination: "BTC" }).id,
  );
  const poor = fixture({ cash: "49.999999999999" });
  err(
    () =>
      poor.e.quote({ kind: "conversion", source: "USD", destination: "BTC" }),
    "INSUFFICIENT_AVAILABLE_FUNDS",
  );
  assert.equal(poor.e.state().converter.nextAt, null);
});
test("E04: 30-second quote expires exactly at boundary; revalidates balance and destination including bonus", () => {
  const f = fixture();
  f.mark("ETC", "5");
  const q = f.e.quote({
    kind: "conversion",
    source: "USD",
    destination: "ETC",
  });
  f.time(30000);
  err(() => f.command({ action: "convert", quoteId: q.id }), "QUOTE_EXPIRED");
  assert.equal(f.row("USD").balance, "1000.00");
  assert.equal(f.e.state().converter.nextAt, null);
  const g = fixture({ etc: "340" });
  g.mark("ETC", "5");
  err(
    () => g.e.quote({ kind: "conversion", source: "USD", destination: "ETC" }),
    "DESTINATION_STORAGE_FULL",
  );
  assert.equal(g.row("USD").balance, "1000.00");
  const h = fixture();
  h.mark("ETC", "5");
  const quote = h.e.quote({
    kind: "conversion",
    source: "USD",
    destination: "ETC",
  });
  h.b.accountWallet().cash = parseUnits("49", 12);
  err(
    () => h.command({ action: "convert", quoteId: quote.id }),
    "INSUFFICIENT_AVAILABLE_FUNDS",
  );
  assert.equal(h.row("ETC").balance, "0");
  assert.equal(h.e.state().converter.nextAt, null);
});
test("E05: binding conversion price survives a subsequent mark change", () => {
  const f = fixture();
  f.mark("ETC", "5");
  const q = f.e.quote({
    kind: "conversion",
    source: "USD",
    destination: "ETC",
  });
  f.mark("ETC", "10");
  f.command({ action: "convert", quoteId: q.id });
  assert.equal(f.row("ETC").balance, "12.5");
  assert.equal(f.row("USD").balance, "950.00");
});
test("E06: source rounding change and fractional BTC bonus are conserved at synthetic $3/BTC", () => {
  const f = fixture({ cash: "100" });
  f.mark("BTC", "3");
  const q = f.e.quote({
    kind: "conversion",
    source: "USD",
    destination: "BTC",
  });
  f.command({ action: "convert", quoteId: q.id });
  assert.equal(f.row("USD").balance, "50.00000002");
  assert.equal(f.row("BTC").balance, "20.83333332");
  const credit = f.e.state().credits.find((c) => c.asset === "BTC")!;
  assert.equal(credit.fractionalRemainder, true);
  assert.equal(credit.origins, 1);
  assert.equal(credit.claimable, "0");
  const pending = f.e.dump().credits.filter((c) => c.asset === "BTC");
  assert.deepEqual(
    pending.map((c) => c.amount),
    [{ n: 1n, d: 2n }],
  );
});
test("E07: fractional origin pools aggregate FIFO; claim is a transfer and does not pay again", () => {
  const f = fixture();
  f.e.owed("BTC", fraction(1n, 2n), "first-half");
  f.e.owed("BTC", fraction(1n, 2n), "second-half");
  assert.equal(
    f.e.state().credits.find((c) => c.asset === "BTC")!.claimable,
    "0.00000001",
  );
  f.command({ action: "claim-credit", asset: "BTC" });
  assert.equal(f.row("BTC").balance, "0.00000001");
  assert.equal(f.e.dump().credits.length, 0);
  err(
    () => f.command({ action: "claim-credit", asset: "BTC" }),
    "NOTHING_TO_CLAIM",
  );
  f.e.owed("ETC", fraction(50n), "first-half-micro");
  f.e.owed("ETC", fraction(50n), "second-half-micro");
  f.command({ action: "claim-credit", asset: "ETC" });
  assert.equal(f.row("ETC").balance, "0.000001");
});
test("E08: owed credits stay unspendable at capacity, partial claim retains each origin remainder", () => {
  const f = fixture({ cash: "1999" });
  f.e.owed("USD", fraction(parseUnits("5", 12)), "profit");
  f.command({ action: "claim-credit", asset: "USD" });
  assert.equal(f.row("USD").balance, "2000.00");
  assert.equal(f.e.dump().credits[0].amount.n, parseUnits("4", 12));
  err(
    () => f.command({ action: "claim-credit", asset: "USD" }),
    "NOTHING_TO_CLAIM",
  );
  f.b.accountWallet().cash = parseUnits("1990", 12);
  f.command({ action: "claim-credit", asset: "USD" });
  assert.equal(f.row("USD").balance, "1994.00");
  assert.equal(f.e.dump().credits.length, 0);
});
test("E09: Town Hall lesson prerequisite, $100 payment, 12 real hours; not a perpetual-learning gate", () => {
  const f = fixture();
  const q = f.e.quote({
    kind: "upgrade",
    building: "town-hall",
    paymentAsset: "USD",
  });
  assert.equal(f.row("USD").balance, "1000.00");
  f.command({ action: "upgrade", quoteId: q.id });
  assert.equal(f.row("USD").balance, "900.00");
  assert.equal(f.b.state().canUsePerpetuals, true);
  assert.equal(
    f.e.state().constructions[0].finishesAt,
    new Date(12 * HOUR).toISOString(),
  );
  f.time(12 * HOUR - 1);
  assert.equal(f.e.state().townHallLevel, 1);
  f.time(12 * HOUR);
  assert.equal(f.e.state().townHallLevel, 2);
  assert.equal(f.e.state().constructions.length, 0);
  const g = fixture({ spot: false });
  err(
    () =>
      g.e.quote({
        kind: "upgrade",
        building: "town-hall",
        paymentAsset: "USD",
      }),
    "UPGRADE_LOCKED",
  );
});
test("E10: cancellation needs acknowledgement, refunds original units, fresh restart cost and timer", () => {
  const f = fixture({ btc: "20" });
  f.mark("BTC", "7");
  let q = f.e.quote({
    kind: "upgrade",
    building: "town-hall",
    paymentAsset: "BTC",
  });
  f.command({ action: "upgrade", quoteId: q.id });
  const original = f.e.state().constructions[0];
  assert.equal(original.paid, "14.28571429");
  f.mark("BTC", "70");
  const cancel = f.e.quote({
    kind: "cancellation",
    constructionId: original.id,
  });
  err(
    () =>
      f.command({
        action: "cancel-upgrade",
        quoteId: cancel.id,
        acknowledged: false,
      }),
    "ACKNOWLEDGEMENT_REQUIRED",
  );
  assert.equal(f.e.state().constructions.length, 1);
  f.command({
    action: "cancel-upgrade",
    quoteId: cancel.id,
    acknowledged: true,
  });
  assert.equal(f.row("BTC").balance, "12.85714285");
  assert.equal(
    f.e.state().credits.find((c) => c.asset === "BTC")!.fractionalRemainder,
    true,
  );
  f.time(HOUR);
  q = f.e.quote({
    kind: "upgrade",
    building: "town-hall",
    paymentAsset: "USD",
  });
  f.command({ action: "upgrade", quoteId: q.id });
  const restarted = f.e.state().constructions[0];
  assert.notEqual(restarted.id, original.id);
  assert.equal(restarted.paid, "100.00");
  assert.equal(restarted.finishesAt, new Date(13 * HOUR).toISOString());
  err(
    () => f.e.quote({ kind: "cancellation", constructionId: original.id }),
    "NOT_FOUND",
  );
  f.time(13 * HOUR);
  err(
    () => f.e.quote({ kind: "cancellation", constructionId: restarted.id }),
    "NOT_FOUND",
  );
});
test("E11: collectors require the opposite mined asset and TH2; one active construction per building", () => {
  const f = fixture({ btc: "1", etc: "50" });
  err(
    () => f.e.quote({ kind: "upgrade", building: "ETC", paymentAsset: "BTC" }),
    "UPGRADE_LOCKED",
  );
  const q = f.e.quote({
    kind: "upgrade",
    building: "town-hall",
    paymentAsset: "USD",
  });
  f.command({ action: "upgrade", quoteId: q.id });
  err(
    () =>
      f.e.quote({
        kind: "upgrade",
        building: "town-hall",
        paymentAsset: "USD",
      }),
    "CONSTRUCTION_EXISTS",
  );
  f.time(12 * HOUR);
  f.e.synchronize();
  err(
    () => f.e.quote({ kind: "upgrade", building: "ETC", paymentAsset: "ETC" }),
    "INVALID_PAYMENT_ASSET",
  );
  err(
    () => f.e.quote({ kind: "upgrade", building: "BTC", paymentAsset: "BTC" }),
    "INVALID_PAYMENT_ASSET",
  );
  for (const [building, paymentAsset] of [
    ["ETC", "BTC"],
    ["BTC", "ETC"],
  ] as const) {
    const quote = f.e.quote({ kind: "upgrade", building, paymentAsset });
    f.command({ action: "upgrade", quoteId: quote.id });
  }
  assert.equal(f.row("BTC").balance, "0.999");
  assert.equal(f.row("ETC").balance, "40");
  assert.equal(f.e.state().constructions.length, 2);
  f.time(24 * HOUR);
  assert.deepEqual(
    f.e.state().buildings.map((b) => b.level),
    [2, 2, 2],
  );
  assert.deepEqual(
    f.b.state().generators.map((g) => [g.ratePerHour, g.capacity]),
    [
      ["2", "100"],
      ["0.0002", "0.01"],
    ],
  );
});
test("E12: optional questions are lesson-gated and do not expose answer keys before grading", () => {
  const f = fixture({ spot: false });
  assert.equal(f.e.state().questions.length, 12);
  const q = f.e.state().questions[0];
  assert.equal(q.unlocked, false);
  assert.equal(q.result, null);
  assert.deepEqual(Object.keys(q.options[0]).sort(), ["id", "text"]);
  err(
    () =>
      f.command({ action: "answer", questionId: "market-value", answer: "A" }),
    "QUESTION_LOCKED",
  );
});
test("E13: first correct attempt pays 5 once; wrong attempts unlimited, any later correct pays 2.5", () => {
  const f = fixture();
  f.command({ action: "answer", questionId: "market-value", answer: "A" });
  assert.equal(f.row("USD").balance, "1005.00");
  assert.deepEqual(f.e.state().questions[0].result, {
    correct: true,
    correctAnswer: "A",
    explanation:
      "Price changes valuation; it does not create asset units or automatically realize a sale.",
    reward: "5",
  });
  f.command({ action: "answer", questionId: "market-value", answer: "A" });
  assert.equal(f.row("USD").balance, "1005.00");
  assert.equal(f.e.state().questions[0].attempts, 1);
  for (let i = 0; i < 8; i++)
    f.command({ action: "answer", questionId: "gtc-pending", answer: "A" });
  assert.equal(f.row("USD").balance, "1005.00");
  f.command({ action: "answer", questionId: "gtc-pending", answer: "B" });
  assert.equal(f.row("USD").balance, "1007.50");
  assert.equal(f.e.state().questions[1].attempts, 9);
  assert.equal(f.e.state().questions[1].result!.reward, "2.5");
});
test("E14: full-wallet quiz reward goes to owed credit, not dropped or paid twice", () => {
  const f = fixture({ cash: "2000" });
  f.command({ action: "answer", questionId: "market-value", answer: "A" });
  assert.equal(f.row("USD").balance, "2000.00");
  assert.equal(f.e.dump().credits[0].amount.n, parseUnits("5", 12));
  f.command({ action: "answer", questionId: "market-value", answer: "A" });
  assert.equal(f.e.dump().credits.length, 1);
  f.b.accountWallet().cash = parseUnits("1990", 12);
  f.command({ action: "claim-credit", asset: "USD" });
  assert.equal(f.row("USD").balance, "1995.00");
});
test("E15: assist is an extra 100 at strictly below50, finite fixture, ordinary cadence unconfigured", () => {
  const f = fixture({ cash: "20", assistance: true });
  assert.equal(f.e.state().assistance.available, true);
  f.command({ action: "claim-assistance" });
  assert.equal(f.row("USD").balance, "120.00");
  f.b.accountWallet().cash = 0n;
  assert.equal(f.e.state().assistance.available, false);
  err(
    () => f.command({ action: "claim-assistance" }),
    "ASSISTANCE_UNAVAILABLE",
  );
  const exact = fixture({ cash: "50", assistance: true });
  assert.equal(exact.e.state().assistance.available, false);
  const below = fixture({ cash: "49.999999999999", assistance: true });
  assert.equal(below.e.state().assistance.available, true);
  const normal = fixture({ cash: "0" });
  assert.equal(normal.e.state().assistance.available, false);
  assert.match(normal.e.state().assistance.reason, /configuration/);
});
test("E16: assistance rechecks recoverable credits/collectors/converter before claiming", () => {
  const pending = fixture({ cash: "0", assistance: true });
  pending.e.owed("USD", fraction(parseUnits("1", 12)), "refund");
  assert.equal(pending.e.state().assistance.available, false);
  assert.match(pending.e.state().assistance.reason, /pending credits/);
  const collect = fixture({ cash: "0", assistance: true });
  collect.time(HOUR);
  assert.equal(collect.e.state().assistance.available, false);
  assert.match(collect.e.state().assistance.reason, /Collect/);
  const convert = fixture({ cash: "20", etc: "10", assistance: true });
  convert.mark("ETC", "5");
  assert.equal(convert.e.state().assistance.available, false);
  assert.match(convert.e.state().assistance.reason, /converter/);
});
test("E17: all new manual activities blocked during real AND practice demonstrations", () => {
  for (const practice of [false, true]) {
    const f = fixture({ spot: practice, cash: "20", assistance: true });
    if (practice) {
      const d = f.b.dump();
      d.seeds.set("market-etc", {
        wallet: structuredClone(d.wallet),
        scenario: structuredClone(
          ALL_SCENARIOS.find((s) => s.id === "market-etc")!,
        ),
      });
      f.b.restore(d);
    }
    f.b.command({
      action: "start",
      intentId: "manual-gate-start",
      variantId: "market-etc",
    });
    assert.equal(f.b.state().lesson!.practice, practice);
    for (const c of [
      { action: "claim-credit", asset: "USD" },
      { action: "claim-assistance" },
      { action: "answer", questionId: "market-value", answer: "A" },
    ])
      err(() => f.command(c), "ACTIVE_DEMONSTRATION");
    err(
      () =>
        f.e.quote({ kind: "conversion", source: "USD", destination: "BTC" }),
      "ACTIVE_DEMONSTRATION",
    );
    assert.equal(f.e.state().manualActionsAllowed, false);
  }
});
test("E18: BTC satoshi precision and four-place price tick produce exact 12-place USD", () => {
  assert.equal(
    cash(product(quantity("0.00000001", "BTC"), price("58639.4050", "BTC"))),
    "0.00058639405",
  );
  err(() => price("58639.405001", "BTC"), "INVALID_COMMAND");
  err(() => quantity("0.000000001", "BTC"), "INVALID_COMMAND");
  err(() => quantity("0.00000001", "ETC"), "INVALID_COMMAND");
  assert.equal(quantity("0.000001", "ETC"), 100n);
});

test("E19: missing or invalid server quote components fail closed without conversion effects", () => {
  for (const invalid of [0n, -1n, undefined]) {
    const f = fixture();
    const d = f.b.dump();
    d.marks.BTC = invalid as bigint;
    f.b.restore(d);
    const before = structuredClone(f.b.accountWallet());
    err(
      () =>
        f.e.quote({ kind: "conversion", source: "USD", destination: "BTC" }),
      "PRICE_UNAVAILABLE",
    );
    assert.deepEqual(f.b.accountWallet(), before);
    assert.equal(f.e.dump().quotes.size, 0);
  }
});
test("E20: exact destination capacity includes the complete base-plus-bonus entitlement", () => {
  const exact = fixture({ etc: "337.5" });
  exact.mark("ETC", "5");
  const q = exact.e.quote({
    kind: "conversion",
    source: "USD",
    destination: "ETC",
  });
  exact.command({ action: "convert", quoteId: q.id });
  assert.equal(exact.row("ETC").balance, "350");
  const over = fixture({ etc: "337.500001" });
  over.mark("ETC", "5");
  const before = structuredClone(over.b.accountWallet());
  err(
    () =>
      over.e.quote({ kind: "conversion", source: "USD", destination: "ETC" }),
    "DESTINATION_STORAGE_FULL",
  );
  assert.deepEqual(over.b.accountWallet(), before);
  assert.equal(over.e.dump().cooldown, null);
});
test("E21: settlement profits above cash capacity are owed and remain part of PnL; claiming never pays PnL twice", () => {
  const scenario = {
    id: "profit-overflow-oracle",
    lessonId: "market" as const,
    title: "Independent 2 to 3",
    recommendedAsset: "ETC" as const,
    defaultQuantity: "5",
    frames: {
      ETC: [
        2000000n,
        3000000n,
        3000000n,
        3000000n,
        3000000n,
        3000000n,
        3000000n,
      ],
      SOL: Array(7).fill(100000000n),
      BTC: Array(7).fill(2000000000n),
    },
  };
  const b = new MarketBook(() => 0, "20", [scenario]),
    e = new EconomyBook(b, () => 0),
    d = b.dump();
  d.wallet.cash = parseUnits("1999", 12);
  b.restore(d);
  b.command({ action: "start", intentId: "overflow-start-key" });
  const attemptId = b.state().lesson!.id;
  b.command({
    action: "order",
    intentId: "overflow-order-key",
    attemptId,
    symbol: "ETC",
    side: "buy",
    quantity: "5",
  });
  b.advance(attemptId, 180);
  e.synchronize();
  const report = b.report(attemptId);
  assert.equal(b.state().demoUsd, "2000.00");
  assert.equal(b.state().holdings[0].quantity, "20");
  assert.equal(report.result.cashChange, "5.00");
  assert.equal(report.result.portfolioValueChange, "25.00");
  assert.equal(e.dump().credits[0].amount.n, parseUnits("4", 12));
  e.synchronize();
  assert.equal(e.dump().credits.length, 1);
  b.accountWallet().cash = parseUnits("1990", 12);
  e.command({
    action: "claim-credit",
    intentId: "overflow-claim-key",
    asset: "USD",
  });
  assert.equal(cash(b.accountWallet().cash), "1994.00");
  assert.equal(e.dump().credits.length, 0);
  assert.deepEqual(b.report(attemptId), report);
  b.command({
    action: "start",
    intentId: "overflow-practice-start",
    variantId: scenario.id,
  });
  b.command({
    action: "order",
    intentId: "overflow-practice-order",
    attemptId: b.state().lesson!.id,
    symbol: "ETC",
    side: "buy",
    quantity: "5",
  });
  b.advance(b.state().lesson!.id, 180);
  e.synchronize();
  assert.equal(cash(b.accountWallet().cash), "1994.00");
  assert.equal(e.dump().credits.length, 0);
});
test("E22: wrong question revision and stale assistance offer never grade or pay", () => {
  const f = fixture();
  err(
    () =>
      f.command({
        action: "answer",
        questionId: "market-value",
        questionRevision: "obsolete",
        answer: "A",
      }),
    "QUESTION_STALE",
  );
  assert.equal(f.e.state().questions[0].attempts, 0);
  assert.equal(f.row("USD").balance, "1000.00");
  const aid = fixture({ cash: "20", assistance: true });
  const offered = aid.e.state().assistance.offerId;
  assert.ok(offered);
  aid.b.accountWallet().cash = parseUnits("50", 12);
  err(
    () => aid.command({ action: "claim-assistance", offerId: offered }),
    "ASSISTANCE_UNAVAILABLE",
  );
  assert.equal(aid.row("USD").balance, "50.00");
});

test("E23: exactly50 is convertible and confirmation just before30seconds succeeds", () => {
  const f = fixture({ cash: "50" });
  f.mark("ETC", "5");
  const q = f.e.quote({
    kind: "conversion",
    source: "USD",
    destination: "ETC",
  });
  f.time(29999);
  f.command({ action: "convert", quoteId: q.id });
  assert.equal(f.row("USD").balance, "0.00");
  assert.equal(f.row("ETC").balance, "12.5");
});
test("E24: unsupported old catalog aliases and a zero received quantity are rejected without money movement", () => {
  const f = fixture();
  for (const source of ["USDT", "XRP", "ETH", "btc"])
    err(
      () => f.e.quote({ kind: "conversion", source, destination: "BTC" }),
      "INVALID_CONVERSION",
    );
  f.mark("BTC", "9000000000000");
  const before = structuredClone(f.b.accountWallet());
  err(
    () => f.e.quote({ kind: "conversion", source: "USD", destination: "BTC" }),
    "AMOUNT_TOO_SMALL",
  );
  assert.deepEqual(f.b.accountWallet(), before);
  assert.equal(f.e.dump().cooldown, null);
});
test("E25: refund overflow remains protected pending credit while cancellation and original asset accounting complete", () => {
  const f = fixture();
  const q = f.e.quote({
    kind: "upgrade",
    building: "town-hall",
    paymentAsset: "USD",
  });
  f.command({ action: "upgrade", quoteId: q.id });
  const id = f.e.state().constructions[0].id;
  f.b.accountWallet().cash = parseUnits("2000", 12);
  const cancel = f.e.quote({ kind: "cancellation", constructionId: id });
  f.command({
    action: "cancel-upgrade",
    quoteId: cancel.id,
    acknowledged: true,
  });
  assert.equal(f.e.state().constructions.length, 0);
  assert.equal(f.row("USD").balance, "2000.00");
  assert.equal(f.e.dump().credits[0].amount.n, parseUnits("50", 12));
  f.b.accountWallet().cash = parseUnits("1990", 12);
  f.command({ action: "claim-credit", asset: "USD" });
  assert.equal(f.row("USD").balance, "2000.00");
  assert.equal(f.e.dump().credits[0].amount.n, parseUnits("40", 12));
});
