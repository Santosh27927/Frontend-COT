import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";
const httpDataDir = mkdtempSync(join(tmpdir(), "cot-http-regression-"));
process.env.COT_DEMO_DATA_DIR = httpDataDir;
after(() => rmSync(httpDataDir, { recursive: true, force: true }));
import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketBook } from "./book.ts";
import { LESSONS } from "./course.ts";
import { ALL_SCENARIOS, SCENARIOS, fixedMarks } from "./test-fixtures.ts";

import {
  submit,
  reconcile,
  empty,
  available,
  walletView,
  parseDraft,
} from "./execution.ts";
import type { Execution } from "./execution.ts";
import { breach } from "./perpetual.ts";
import { decimal, quantity, CASH_UNIT, MAX } from "./exact.ts";
import { assessOrder } from "./preview.ts";
import { DemoError } from "../errors.ts";
import { resetDemoStore } from "../store.ts";
import { handleMockRequest } from "../handler.ts";
import type { LessonId, OrderDraft } from "../../api/market-types.ts";

const rejects = (f: () => unknown, code: string) =>
  assert.throws(f, (e) => e instanceof DemoError && e.code === code);
const state = (): Execution => ({
  wallet: { cash: 1000n * CASH_UNIT, quantities: empty() },
  bought: empty(),
  orders: [],
  guides: [],
  events: [],
  positions: {},
});
const draft = (
  side: "buy" | "sell",
  quantity: string,
  leverage = 2,
  reduceOnly = false,
): OrderDraft => ({
  attemptId: "fixture",
  product: "perpetual",
  symbol: "SOL",
  side,
  quantity,
  leverage,
  reduceOnly,
});
function fixture() {
  let now = 1000000,
    seq = 0;
  const b = new MarketBook(() => now, "20", ALL_SCENARIOS),
    key = () => `phase4-intent-${++seq}`,
    s = () => b.state(),
    start = (variantId: string) =>
      b.command({ action: "start", intentId: key(), variantId });
  const order = (d: Partial<OrderDraft>, intentId = key()) =>
    b.command({
      action: "order",
      intentId,
      attemptId: s().lesson!.id,
      symbol: "ETC",
      side: "buy",
      quantity: "1",
      ...d,
    });
  const advance = (seconds: number) => b.advance(s().lesson!.id, seconds);
  const auto = (id: LessonId) => {
    const a = s().lesson!,
      symbol = a.recommendedAsset,
      quantity = a.defaultQuantity,
      p = { product: "perpetual" as const, symbol, quantity, leverage: 1 };
    if (id === "market") {
      order({});
      order({ side: "sell" });
    } else if (id === "perp-direction") {
      order(p);
      order({
        ...p,
        symbol: symbol === "ETC" ? "SOL" : "ETC",
        quantity: "0.1",
        side: "sell",
      });
    } else if (id === "perp-collateral" || id === "perp-size") {
      order(p);
      order({ ...p, side: "sell", reduceOnly: true });
      order(s().lesson!.comparison!.nextOrder!);
    } else if (id === "perp-liquidation") order({ ...p, leverage: 5 });
    else if (id === "combined") {
      order({ ...p, leverage: 2 });
      const example = s().lesson!.sharedFundsExample!;
      rejects(
        () => order({ ...example, product: "spot" }),
        "INSUFFICIENT_AVAILABLE_FUNDS",
      );
      order({ symbol, quantity });
    } else {
      const defaults = a.form.defaults.find(
        (d) => d.symbol === symbol && d.side === "buy",
      )!;
      const perp = id.startsWith("perp-") ? p : { symbol, quantity };
      if (id === "ioc-fok" || id === "perp-ioc-fok") {
        const price = a.quotes.find((q) => q.symbol === symbol)!.price;
        for (const timeInForce of ["IOC", "FOK"] as const)
          order({
            ...perp,
            orderType: "LIMIT",
            timeInForce,
            limitPrice: price,
          });
      } else
        order({
          ...perp,
          orderType: id === "gtc" || id === "perp-gtc" ? "LIMIT" : "STOP_LIMIT",
          timeInForce: "GTC",
          limitPrice: defaults.limitPrice,
          ...(id === "stop-limit" || id === "perp-stop"
            ? { stopPrice: defaults.stopPrice }
            : {}),
        });
    }
  };
  const before = (target: LessonId) => {
    for (const l of LESSONS) {
      if (l.id === target) break;
      for (const scenario of ALL_SCENARIOS.filter((s) => s.lessonId === l.id)) {
        start(scenario.id);
        auto(l.id);
        advance(180);
        assert.equal(s().lesson!.assessment, "passed", scenario.id);
      }
    }
    fixedMarks(b);
  };
  return {
    b,
    s,
    key,
    start,
    order,
    advance,
    auto,
    before,
    wall: (ms: number) => {
      now += ms;
    },
  };
}

test("P: independent Go golden weighted increase, partial/full release and realized PnL; no notional cash or spot units", () => {
  const e = state(),
    scenario = SCENARIOS[0];
  submit(e, scenario, draft("buy", "10"), 0);
  assert.equal(e.wallet.cash, 1000n * CASH_UNIT);
  assert.equal(available(e).cash, 500n * CASH_UNIT);
  assert.equal(e.wallet.quantities.SOL, 0n);
  reconcile(e, scenario, 30000);
  submit(e, scenario, draft("sell", "4", 2, true), 30000);
  assert.equal(e.wallet.cash, 1020n * CASH_UNIT);
  assert.equal(e.positions!.SOL!.q, quantity("6", "SOL"));
  assert.equal(e.positions!.SOL!.margin, 300n * CASH_UNIT);
  submit(e, scenario, draft("buy", "2"), 30000);
  assert.equal(e.positions!.SOL!.q, quantity("8", "SOL"));
  assert.equal(e.positions!.SOL!.basis, 810n * CASH_UNIT);
  assert.equal(e.positions!.SOL!.margin, 405n * CASH_UNIT);
  submit(e, scenario, draft("sell", "8", 2, true), 30000);
  assert.equal(e.wallet.cash, 1050n * CASH_UNIT);
  assert.deepEqual(e.positions, {});
  assert.equal(available(e).cash, 1050n * CASH_UNIT);
  assert.equal(e.positionCloses!.length, 2);
  assert.equal(e.positionCloses![0].realizedPnl, "20.00");
  assert.equal(e.positionCloses![1].realizedPnl, "30.00");
});
test("P: short sign, one-way/leverage rejection and queued reduce reservations cannot oversubscribe", () => {
  const e = state(),
    s = SCENARIOS[0];
  submit(e, s, draft("sell", "10"), 0);
  rejects(() => submit(e, s, draft("buy", "1"), 0), "INVALID_COMMAND");
  rejects(() => submit(e, s, draft("sell", "1", 5), 0), "INVALID_COMMAND");
  submit(
    e,
    s,
    {
      ...draft("buy", "8", 2, true),
      orderType: "LIMIT",
      timeInForce: "GTC",
      limitPrice: "90",
    },
    0,
  );
  rejects(
    () => submit(e, s, draft("buy", "3", 2, true), 0),
    "INSUFFICIENT_AVAILABLE_FUNDS",
  );
  submit(e, s, draft("buy", "2", 2, true), 0);
  reconcile(e, s, 60000);
  assert.deepEqual(e.positions, {});
  assert.equal(e.wallet.cash, 1080n * CASH_UNIT);
  assert.equal(e.positionCloses!.length, 2);
});
test("L/T: delayed long/short5x guide liquidates at acceptance+60 once, caps gap, and never replays old risk on later openings", () => {
  for (const side of ["buy", "sell"] as const) {
    const e = state(),
      s = { ...SCENARIOS[0], lessonId: "perp-liquidation" as const };
    reconcile(e, s, 10000);
    submit(e, s, draft(side, "10", 5), 10000);
    reconcile(e, s, 69999);
    assert.equal(e.liquidations?.length ?? 0, 0);
    reconcile(e, s, 70000);
    assert.equal(e.liquidations!.length, 1);
    assert.equal(e.liquidations![0].second, 70);
    assert.equal(e.liquidations![0].realizedPnl, "-200.00");
    assert.equal(e.liquidations![0].trainingBackstop, "100.00");
    assert.equal(e.wallet.cash, 800n * CASH_UNIT);
    assert.deepEqual(e.positions, {});
    reconcile(e, s, 70000);
    assert.equal(e.liquidations!.length, 1);
    submit(e, s, draft(side, "1", 5), 100000);
    reconcile(e, s, 100001);
    assert.equal(e.liquidations!.length, 1);
    assert.equal(e.positions!.SOL!.q, quantity("1", "SOL"));
  }
});
test("L: exact maintenance boundary and upward accounting-atom rounding", () => {
  const e = state();
  submit(e, SCENARIOS[0], draft("buy", "10", 5), 0);
  assert.equal(breach(e, "SOL", decimal("80.808081")), null);
  assert.notEqual(breach(e, "SOL", decimal("80.808080")), null);
});
test("U/F: entire36 distinct course unlocks groups/lessons in sequence, no extra generators or practice farming", () => {
  const f = fixture();
  rejects(() => f.start("perp-direction-etc"), "LESSON_LOCKED");
  f.before("perp-direction");
  assert.equal(f.s().canUsePerpetuals, true);
  assert.equal(f.s().course.totalCompletedScenarios, 12);
  assert.equal(f.s().marketGroups[2].unlocked, false);
  f.before("combined");
  assert.equal(f.s().marketGroups[2].unlocked, true);
  assert.equal(f.s().course.totalCompletedScenarios, 33);
  for (const v of ALL_SCENARIOS.filter((s) => s.lessonId === "combined")) {
    f.start(v.id);
    f.auto("combined");
    f.advance(180);
    assert.equal(f.s().lesson!.assessment, "passed");
  }
  const s = f.s();
  assert.equal(s.course.totalCompletedScenarios, 36);
  assert.equal(s.course.allComplete, true);
  assert.deepEqual(
    s.generators.map((g) => g.earned),
    [true, true],
  );
  const cash = s.demoUsd,
    holdings = s.holdings.map((h) => [h.asset, h.quantity]);
  f.start("perp-direction-etc");
  assert.equal(f.s().lesson!.practice, true);
  f.auto("perp-direction");
  f.advance(180);
  assert.equal(f.s().demoUsd, cash);
  assert.deepEqual(
    f.s().holdings.map((h) => [h.asset, h.quantity]),
    holdings,
  );
  assert.equal(f.s().course.totalCompletedScenarios, 36);
});
for (const policy of ["perp-collateral", "perp-size"] as const)
  test(`C: ${policy} requires actual baseline/full close/sameasset-direction target; wrong valid size does not pass`, () => {
    const f = fixture();
    f.before(policy);
    f.start(policy + "-etc");
    f.order({ product: "perpetual", leverage: 1 });
    const id = f.s().lesson!.id,
      openingCash = f.s().lesson!.wallet.cash;
    rejects(
      () => f.order({ product: "perpetual", leverage: 2 }),
      "INVALID_COMMAND",
    );
    f.order({
      product: "perpetual",
      side: "sell",
      reduceOnly: true,
      quantity: "0.5",
    });
    assert.equal(f.s().lesson!.comparison!.baselineClosed, false);
    f.order({
      product: "perpetual",
      side: "sell",
      reduceOnly: true,
      quantity: "0.5",
    });
    const next = f.s().lesson!.comparison!.nextOrder!;
    f.order({ ...next, quantity: "3" });
    assert.equal(f.s().lesson!.goals.at(-1)!.done, false);
    f.order({
      product: "perpetual",
      side: "sell",
      reduceOnly: true,
      quantity: "3",
    });
    const otherQuantity = policy === "perp-collateral" ? "0.04" : "1";
    f.order({ ...next, symbol: "SOL", quantity: otherQuantity });
    assert.equal(f.s().lesson!.comparison!.paired, null);
    f.order({
      product: "perpetual",
      symbol: "SOL",
      side: "sell",
      reduceOnly: true,
      quantity: otherQuantity,
    });
    f.order({ ...next, side: "sell" });
    assert.equal(f.s().lesson!.comparison!.paired, null);
    f.order({
      product: "perpetual",
      side: "buy",
      reduceOnly: true,
      quantity: next.quantity,
    });
    f.order(next);
    assert.equal(
      f.s().lesson!.goals.every((g) => g.done),
      true,
    );
    assert.equal(
      f.s().lesson!.comparison!.paired!.quantity,
      policy === "perp-size" ? "1" : "2",
    );
    const accepted = f.s().lesson!.orders.length;
    f.order({
      product: "perpetual",
      leverage: 2,
      symbol: "SOL",
      quantity: "0.01",
    });
    f.advance(80);
    assert.equal(f.s().lesson!.canFastForward, true);
    f.b.command({ action: "finish", attemptId: id, intentId: f.key() });
    assert.equal(f.s().lesson!.assessment, "passed");
    assert.equal(f.s().lesson!.orders.length > accepted, true);
    assert.notEqual(openingCash, "0.00");
  });
test("C: quote changes update exact collateral target, disclose rounding and retain actual comparison fills", () => {
  const f = fixture();
  f.before("perp-collateral");
  f.start("perp-collateral-etc");
  f.order({ product: "perpetual", leverage: 1 });
  f.advance(30);
  f.order({ product: "perpetual", side: "sell", reduceOnly: true });
  assert.equal(f.s().lesson!.comparison!.targetQuantity, "1.904761");
  f.order(f.s().lesson!.comparison!.nextOrder!);
  const c = f.s().lesson!.comparison!;
  assert.equal(c.baseline!.notional, "2.00");
  assert.equal(c.paired!.notional, "3.9999981");
  assert.equal(c.collateralDifference, "-0.00000095");
  assert.equal(c.baseline!.illustrativeGain, "0.20");
  assert.equal(c.paired!.illustrativeGain, "0.39999981");
});
test("O/P: pending margin, exact max, immediate limits use actual price, cancellation and stop invalid overlap", () => {
  const f = fixture();
  f.before("perp-gtc");
  f.start("perp-gtc-etc");
  const d = {
    product: "perpetual" as const,
    symbol: "SOL" as const,
    side: "buy" as const,
    quantity: "1",
    leverage: 2,
    orderType: "LIMIT" as const,
    timeInForce: "GTC" as const,
    limitPrice: "95",
  };
  f.order(d);
  const before = f.s(),
    pending = before.lesson!.orders[0];
  assert.equal(before.lesson!.wallet.reservedCash, "47.50");
  assert.equal(before.lesson!.positions!.length, 0);
  const p = f.b.preview({ attemptId: before.lesson!.id, ...d });
  assert.equal(p.blockedByPendingOrder, true);
  assert.equal(p.pendingOrder!.id, pending.id);
  const invalid = f.b.preview({
    attemptId: before.lesson!.id,
    ...d,
    quantity: "",
  });
  assert.equal(invalid.blockedByPendingOrder, false);
  assert.equal(invalid.valid, false);
  assert.deepEqual(f.s(), before);
  f.b.command({
    action: "cancel",
    intentId: f.key(),
    attemptId: before.lesson!.id,
    orderId: pending.id,
  });
  assert.equal(f.s().lesson!.wallet.reservedCash, "0.00");
  const sell = f.b.preview({
    attemptId: before.lesson!.id,
    ...d,
    side: "sell",
    limitPrice: "90",
  });
  assert.equal(sell.referencePrice, "100");
  assert.equal(sell.marginRequired, "50.00");
  f.order(d);
  f.advance(60);
  assert.equal(f.s().lesson!.orders[1].status, "FILLED");
  assert.equal(f.s().lesson!.positions![0].margin, "47.50");
});
test("S/H: real margin-only spot rejection is once-only evidence without order/reserve/receipt; malformed/no-margin demand cannot forge it", () => {
  const f = fixture();
  f.before("combined");
  f.start("combined-etc");
  rejects(
    () => f.order({ quantity: "999999" }),
    "INSUFFICIENT_AVAILABLE_FUNDS",
  );
  assert.equal(f.s().lesson!.marginRejection, null);
  f.order({ product: "perpetual", leverage: 2 });
  const before = f.s(),
    example = before.lesson!.sharedFundsExample!,
    key = f.key();
  rejects(() => f.order({ ...example, quantity: "abc" }), "INVALID_COMMAND");
  assert.equal(f.s().lesson!.marginRejection, null);
  rejects(() => f.order(example, key), "INSUFFICIENT_AVAILABLE_FUNDS");
  const after = f.s();
  assert.deepEqual(after.lesson!.wallet, before.lesson!.wallet);
  assert.deepEqual(after.lesson!.orders, before.lesson!.orders);
  assert.equal(after.confirmedIntentIds.includes(key), false);
  assert.notEqual(after.lesson!.marginRejection, null);
  const events = after.lesson!.events;
  rejects(() => f.order(example, key), "INSUFFICIENT_AVAILABLE_FUNDS");
  assert.deepEqual(f.s().lesson!.events, events);
  f.order({ quantity: "1" });
  assert.equal(
    f.s().lesson!.goals.every((g) => g.done),
    true,
  );
});
test("T/D/G: last required anchor, frozen replay/settlement, stable intent after close and blocked collection during perpetual practice", () => {
  const f = fixture();
  f.before("perp-direction");
  f.start("perp-direction-etc");
  const a = f.s().lesson!;
  const key = f.key(),
    d = { product: "perpetual" as const, leverage: 1, quantity: "1" };
  const original = f.order(d, key);
  f.advance(20);
  f.order({ ...d, side: "sell", symbol: "SOL", quantity: "0.01" });
  f.advance(79);
  assert.equal(f.s().lesson!.canFastForward, false);
  f.advance(1);
  assert.equal(f.s().lesson!.canFastForward, true);
  const pre = f.s().lesson!.wallet.holdings.map((h) => [h.asset, h.quantity]);
  f.b.command({ action: "finish", intentId: f.key(), attemptId: a.id });
  assert.deepEqual(
    f.s().lesson!.wallet.holdings.map((h) => [h.asset, h.quantity]),
    pre,
  );
  assert.deepEqual(f.s().lesson!.positions, []);
  const report = f.b.report(a.id);
  assert.equal(report.result.positionCloses!.length, 2);
  assert.deepEqual(
    f.order({ ...d, attemptId: a.id }, key).receipt,
    original.receipt,
  );
  assert.deepEqual(f.b.report(a.id), report);
  const cash = f.s().demoUsd;
  f.start("perp-direction-etc");
  assert.equal(f.s().lesson!.practice, true);
  f.order(d);
  const working = f.s().lesson!.wallet;
  f.b.advanceResources(1);
  rejects(
    () => f.b.command({ action: "collect", intentId: f.key(), asset: "ETC" }),
    "ACTIVE_DEMONSTRATION",
  );
  assert.deepEqual(f.s().lesson!.wallet, working);
  assert.equal(f.s().demoUsd, cash);
  assert.equal(f.s().holdings[0].quantity, "20");
});
test("H: strict perpetual payloads and quantities cannot smuggle authority or unsupported leverage", () => {
  const d = {
    ...draft("buy", "1"),
    attemptId: "11111111-1111-4111-8111-111111111111",
  };
  for (const extra of [
    { leverage: 1.5 },
    { leverage: "2" },
    { product: "spot", leverage: 2 },
    { reduceOnly: "true" },
    { balance: "999" },
    { passed: true },
    { quantity: 1 },
  ])
    rejects(() => parseDraft({ ...d, ...extra }), "INVALID_COMMAND");
  assert.equal(
    parseDraft({
      attemptId: d.attemptId,
      symbol: "SOL",
      side: "buy",
      quantity: "1",
    }).product,
    undefined,
  );
});

test("P/Q: immediate BUY high limit uses actual execution margin at exact maximum; plus one tick rejects without effects", () => {
  const e = state(),
    s = SCENARIOS[0],
    d = {
      ...draft("buy", "20"),
      orderType: "LIMIT" as const,
      timeInForce: "GTC" as const,
      limitPrice: "200",
    };
  const before = structuredClone(e),
    p = assessOrder(e, s, d, 0);
  assert.equal(p.preview.maxQuantity, "20");
  assert.equal(p.preview.referencePrice, "100");
  assert.equal(p.preview.marginRequired, "1000.00");
  assert.equal(p.preview.valid, true);
  assert.deepEqual(e, before);
  const bad = assessOrder(e, s, { ...d, quantity: "20.000001" }, 0);
  assert.equal(bad.rejection!.code, "INSUFFICIENT_AVAILABLE_FUNDS");
  assert.equal(bad.preview.valid, false);
  assert.deepEqual(e, before);
  submit(e, s, d, 0);
  assert.equal(available(e).cash, 0n);
  assert.equal(e.positions!.SOL!.margin, 1000n * CASH_UNIT);
});
test("P/G: exact numeric capacity and partial-close rounding preserve the final basis/margin remainder", () => {
  const s = structuredClone(SCENARIOS[0]);
  s.frames.SOL = Array(7).fill(decimal("100"));
  const e = state();
  e.wallet.cash = MAX;
  const p = assessOrder(e, s, draft("buy", "1", 1), 0);
  assert.equal(p.preview.maxQuantity, "92233.720368");
  assert.equal(
    assessOrder(e, s, draft("buy", "92233.720369", 1), 0).preview.valid,
    false,
  );
  const max = structuredClone(e);
  submit(max, s, draft("buy", "92233.720368", 1), 0);
  assert.equal(max.positions!.SOL!.basis, 9223372036800000000n);
  const tiny = state();
  s.frames.SOL = Array(7).fill(decimal("0.000003"));
  submit(tiny, s, draft("buy", "0.000003", 2), 0);
  assert.equal(tiny.positions!.SOL!.margin, 5n);
  submit(tiny, s, draft("sell", "0.000001", 2, true), 0);
  assert.equal(tiny.positions!.SOL!.basis, 6n);
  assert.equal(tiny.positions!.SOL!.margin, 4n);
  submit(tiny, s, draft("sell", "0.000002", 2, true), 0);
  assert.deepEqual(tiny.positions, {});
  assert.equal(tiny.positionCloses![0].marginReleased, "0.000000000001");
  assert.equal(tiny.positionCloses![1].marginReleased, "0.000000000004");
});
for (const policy of ["perp-collateral", "perp-size"] as const)
  test(`C: prior2x cannot retroactively satisfy ${policy} at the same timestamp`, () => {
    const f = fixture();
    f.before(policy);
    f.start(policy + "-etc");
    const oldQty = policy === "perp-collateral" ? "2" : "1";
    f.order({ product: "perpetual", leverage: 2, quantity: oldQty });
    f.order({
      product: "perpetual",
      reduceOnly: true,
      side: "sell",
      quantity: oldQty,
    });
    f.order({ product: "perpetual", leverage: 1 });
    f.order({ product: "perpetual", reduceOnly: true, side: "sell" });
    assert.equal(f.s().lesson!.comparison!.paired, null);
    assert.equal(f.s().lesson!.goals.at(-1)!.done, false);
    f.order(f.s().lesson!.comparison!.nextOrder!);
    assert.notEqual(f.s().lesson!.comparison!.paired, null);
    assert.equal(
      f.s().lesson!.goals.every((g) => g.done),
      true,
    );
  });
test("L/P: liquidation freezes the observed guided price before queued orders release their guide", () => {
  const e = state(),
    s = SCENARIOS[0];
  submit(e, s, draft("buy", "1", 5), 0);
  submit(
    e,
    s,
    {
      ...draft("buy", "1", 5),
      orderType: "LIMIT",
      timeInForce: "GTC",
      limitPrice: "70",
    },
    0,
  );
  reconcile(e, s, 60000);
  const l = e.liquidations![0];
  assert.equal(l.price, "70");
  assert.equal(l.realizedPnl, "-20.00");
  assert.equal(l.trainingBackstop, "10.00");
  assert.equal(e.wallet.cash, 980n * CASH_UNIT);
  assert.equal(e.orders[1].view.status, "CANCELED");
  assert.equal(e.liquidations!.length, 1);
});
test("L/P: user cancellation rechecks risk and persists isolated liquidation immediately at the same clock", () => {
  const f = fixture();
  f.before("perp-gtc");
  f.start("perp-gtc-etc");
  const p = {
    product: "perpetual" as const,
    symbol: "SOL" as const,
    leverage: 5,
  };
  f.order(p);
  f.order({
    ...p,
    reduceOnly: true,
    side: "sell",
    orderType: "LIMIT",
    timeInForce: "GTC",
    limitPrice: "200",
  });
  f.advance(30);
  f.order({ ...p, quantity: "5" });
  const a = f.s().lesson!,
    cashBefore = a.wallet.cash;
  assert.equal(a.positions![0].entryNotional, "850.00");
  assert.equal(a.positions![0].margin, "170.00");
  f.b.command({
    action: "cancel",
    intentId: f.key(),
    attemptId: a.id,
    orderId: a.orders[1].id,
  });
  const ended = f.s().lesson!;
  assert.deepEqual(ended.positions, []);
  assert.equal(ended.liquidations!.length, 1);
  assert.equal(ended.liquidations![0].price, "105");
  assert.equal(ended.liquidations![0].realizedPnl, "-170.00");
  assert.equal(ended.liquidations![0].trainingBackstop, "50.00");
  assert.notEqual(ended.wallet.cash, cashBefore);
  assert.equal(f.s().demoUsd, ended.wallet.cash);
  const stable = f.s();
  rejects(
    () => f.order({ ...p, reduceOnly: true, side: "sell", quantity: "6" }),
    "INVALID_COMMAND",
  );
  assert.deepEqual(f.s(), stable);
});
test("O/P: incompatible queued open cancels without financial effects after a newer opposite position opens", () => {
  const e = state(),
    s = SCENARIOS[0];
  submit(
    e,
    s,
    {
      ...draft("buy", "1", 2),
      orderType: "LIMIT",
      timeInForce: "GTC",
      limitPrice: "95",
    },
    0,
  );
  submit(e, s, draft("sell", "1", 2), 0);
  reconcile(e, s, 60000);
  assert.equal(e.orders[0].view.status, "CANCELED");
  assert.equal(e.orders[0].reservedCash, 0n);
  assert.equal(e.positions!.SOL!.side, "sell");
  assert.equal(e.positions!.SOL!.q, quantity("1", "SOL"));
  assert.equal(e.wallet.cash, 1000n * CASH_UNIT);
});
test("T/L: liquidation due exactly180 passes without Fast-forward; due180001 cannot create risk evidence", () => {
  for (const extraMs of [0, 1]) {
    const f = fixture();
    f.before("perp-liquidation");
    f.start("perp-liquidation-etc");
    f.advance(120);
    f.wall(extraMs);
    f.order({ product: "perpetual", leverage: 5 });
    f.advance(60);
    assert.equal(f.s().lesson!.status, "ended");
    assert.equal(f.s().lesson!.canFastForward, false);
    assert.equal(f.s().lesson!.assessment, extraMs ? "not-passed" : "passed");
    assert.equal(f.s().lesson!.result!.liquidations!.length, extraMs ? 0 : 1);
  }
});
test("O/H: pending perpetual stop retains real empty/invalid/zero stop and funds errors, never false neutral blockage", () => {
  const f = fixture();
  f.before("perp-stop");
  f.start("perp-stop-etc");
  const d = {
    product: "perpetual" as const,
    leverage: 2,
    orderType: "STOP_LIMIT" as const,
    timeInForce: "GTC" as const,
    limitPrice: "2.05",
    stopPrice: "2.1",
  };
  f.order(d);
  const before = f.s();
  for (const extra of [
    { stopPrice: "" },
    { stopPrice: "abc" },
    { stopPrice: "0" },
    { quantity: "" },
    { quantity: "1000000" },
  ]) {
    const request = {
        attemptId: before.lesson!.id,
        symbol: "ETC" as const,
        side: "buy" as const,
        quantity: "1",
        ...d,
        ...extra,
      },
      p = f.b.preview(request);
    assert.equal(p.blockedByPendingOrder, false);
    assert.equal(p.valid, false);
    assert.equal(p.pendingOrder!.id, before.lesson!.orders[0].id);
    assert.notEqual(p.reason, null);
    rejects(
      () => f.order(request),
      extra.quantity === "1000000"
        ? "INSUFFICIENT_AVAILABLE_FUNDS"
        : "INVALID_COMMAND",
    );
    assert.deepEqual(f.s(), before);
  }
});
test("L/T: synthetic liquidation closes do not consume the256 user-order allowance", () => {
  const e = state(),
    s = structuredClone(SCENARIOS[0]);
  s.frames.SOL = Array(7).fill(decimal("0.000001"));
  for (let i = 0; i < 256; i++) submit(e, s, draft("buy", "0.000001", 5), 0);
  assert.equal(e.orders.length, 512);
  assert.equal(e.orders.filter((o) => !o.system).length, 256);
  rejects(
    () => submit(e, s, draft("buy", "0.000001", 5), 0),
    "INVALID_COMMAND",
  );
});
test("L/T: settlement rechecks risk after canceling a late guide; newly opened positions never see older frames", () => {
  const f = fixture();
  f.before("perp-gtc");
  f.start("perp-gtc-etc");
  f.advance(120);
  f.wall(1);
  const p = {
    product: "perpetual" as const,
    symbol: "SOL" as const,
    leverage: 5,
  };
  f.order(p);
  f.order({
    ...p,
    reduceOnly: true,
    side: "sell",
    orderType: "LIMIT",
    timeInForce: "GTC",
    limitPrice: "200",
  });
  f.advance(30);
  f.order({ ...p, quantity: "5" });
  f.advance(30);
  const result = f.s().lesson!.result!;
  assert.equal(result.liquidations!.length, 1);
  assert.equal(result.liquidations![0].price, "102.5");
  assert.equal(result.liquidations![0].realizedPnl, "-177.00");
  assert.equal(result.liquidations![0].trainingBackstop, "93.00");
  assert.equal(result.liquidations![0].second, 180);
  const e = state(),
    s = SCENARIOS[0];
  reconcile(e, s, 0);
  submit(e, s, draft("sell", "1", 5), 150000);
  reconcile(e, s, 150001);
  assert.equal(e.positions!.SOL!.side, "sell");
  assert.equal(e.liquidations?.length ?? 0, 0);
});
test("G/T: collection is rejected during real perpetual exposure without changing positions, cash or assets", () => {
  const f = fixture();
  f.before("perp-direction");
  f.start("perp-direction-etc");
  f.order({ product: "perpetual", symbol: "SOL", leverage: 1 });
  f.b.advanceResources(1);
  const before = f.s();
  rejects(
    () => f.b.command({ action: "collect", intentId: f.key(), asset: "ETC" }),
    "ACTIVE_DEMONSTRATION",
  );
  assert.deepEqual(f.s(), before);
  f.advance(180);
  assert.equal(f.s().lesson!.result!.resourceInflows.length, 0);
  assert.equal(f.s().holdings[0].quantity, "20");
});
test("D/H HTTP: new perpetual fields remain owned, strictly validated and same-key reduce recovery survives position removal", async () => {
  resetDemoStore();
  const call = (
    action: Parameters<typeof handleMockRequest>[1],
    token?: string,
    body?: unknown,
  ) =>
    handleMockRequest(
      new Request("http://localhost/api/mock/" + action, {
        method: action === "state" ? "GET" : "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      action,
    );
  const a = await (
    await call("sign-in", undefined, {
      username: "learner",
      pin: "0073",
      deviceId: "A",
    })
  ).json();
  let seq = 0;
  const cmd = async (body: Record<string, unknown>) => {
    const r = await call("command", a.token, {
      intentId: `http-phase4-${++seq}`,
      ...body,
    });
    assert.equal(r.status, 200);
    return (await r.json()).state;
  };
  for (const id of ["market", "gtc", "ioc-fok", "stop-limit"])
    for (const asset of ["etc", "sol", "btc"]) {
      const s = await cmd({ action: "start", variantId: id + "-" + asset }),
        d = {
          action: "order",
          attemptId: s.lesson.id,
          symbol: "ETC",
          side: "buy",
          quantity: "1",
        };
      if (id === "market") {
        await cmd(d);
        await cmd({ ...d, side: "sell" });
      } else if (id === "ioc-fok")
        for (const timeInForce of ["IOC", "FOK"])
          await cmd({
            ...d,
            orderType: "LIMIT",
            timeInForce,
            limitPrice: s.lesson.quotes.find(
              (q: { symbol: string }) => q.symbol === "ETC",
            ).price,
          });
      else
        await cmd({
          ...d,
          orderType: id === "gtc" ? "LIMIT" : "STOP_LIMIT",
          timeInForce: "GTC",
          limitPrice: s.lesson.form.defaults.find(
            (x: { symbol: string; side: string }) =>
              x.symbol === "ETC" && x.side === "buy",
          ).limitPrice,
          ...(id === "stop-limit"
            ? {
                stopPrice: s.lesson.form.defaults.find(
                  (x: { symbol: string; side: string }) =>
                    x.symbol === "ETC" && x.side === "buy",
                ).stopPrice,
              }
            : {}),
        });
      assert.equal(
        (
          await call("dev-advance", a.token, {
            attemptId: s.lesson.id,
            seconds: 180,
          })
        ).status,
        200,
      );
    }
  const s = await cmd({ action: "start", variantId: "perp-direction-etc" }),
    d = {
      attemptId: s.lesson.id,
      product: "perpetual",
      leverage: 1,
      symbol: "SOL",
      side: "buy",
      quantity: "1",
    };
  const p = await (await call("order-preview", a.token, d)).json();
  assert.equal(p.preview.product, "perpetual");
  assert.equal(
    p.preview.referencePrice,
    s.lesson.quotes.find((q: { symbol: string }) => q.symbol === "SOL").price,
  );
  assert.equal(p.preview.marginRequired, p.preview.notional); //1x: required initial collateral equals quoted notional.
  const trader = await (
    await call("sign-in", undefined, {
      username: "trader",
      pin: "0042",
      deviceId: "B",
    })
  ).json();
  assert.equal((await call("order-preview", trader.token, d)).status, 404);
  assert.equal(
    (
      await call("command", trader.token, {
        action: "order",
        intentId: "http-foreign-perp",
        ...d,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call("command", a.token, {
        action: "order",
        intentId: "http-forged-perp",
        ...d,
        margin: "0",
        passed: true,
      })
    ).status,
    400,
  );
  await cmd({ action: "order", ...d });
  const c = await (
    await call("sign-in", undefined, {
      username: "learner",
      pin: "0073",
      deviceId: "C",
    })
  ).json();
  assert.equal((await call("order-preview", a.token, d)).status, 401);
  const close = {
    action: "order",
    intentId: "http-close-saved-key",
    attemptId: s.lesson.id,
    product: "perpetual",
    reduceOnly: true,
    symbol: "SOL",
    side: "sell",
    quantity: "1",
  };
  const one = await (await call("command", c.token, close)).json(),
    two = await (await call("command", c.token, close)).json();
  assert.deepEqual(two.receipt, one.receipt);
  assert.equal(two.replayed, true);
  assert.equal(two.state.lesson.orders.length, 2);
  assert.deepEqual(two.state.lesson.positions, []);
  assert.equal(
    (await call("command", c.token, { ...close, quantity: "0.5" })).status,
    409,
  );
});
