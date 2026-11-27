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
import {
  decimal,
  format,
  cash,
  checked,
  MAX,
  product,
  quantity,
} from "./exact.ts";
import { SCENARIOS, ALL_SCENARIOS } from "./test-fixtures.ts";
import type { Scenario } from "./scenarios.ts";
import { DemoError } from "../errors.ts";
import { DemoStore, resetDemoStore } from "../store.ts";
import { handleMockRequest } from "../handler.ts";
const err = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e) => e instanceof DemoError && e.code === code);
function setup(owned = "0", scenarios: Scenario[] = ALL_SCENARIOS) {
  let now = 1000000,
    seq = 0;
  const book = new MarketBook(() => now, owned, scenarios);
  const start = (variantId?: string, intentId = `start-${++seq}-key`) =>
    book.command({
      action: "start",
      intentId,
      ...(variantId ? { variantId } : {}),
    }).receipt.attemptId;
  const order = (
    side = "buy",
    quantity: unknown = "5",
    symbol = "ETC",
    intentId = `order-${++seq}-key`,
  ) =>
    book.command({
      action: "order",
      intentId,
      attemptId: book.state().lesson!.id,
      symbol,
      side,
      quantity,
    });
  const finish = (intentId = `finish-${++seq}-key`) =>
    book.command({
      action: "finish",
      intentId,
      attemptId: book.state().lesson!.id,
    });
  return {
    book,
    start,
    order,
    finish,
    time: (ms: number) => {
      now = 1000000 + ms;
    },
    now: () => now,
  };
}
// Independent user-approved example, not an expected result copied from the engine.
const independent: Scenario = {
  id: "preservation-example",
  title: "Independent 2 to 3",
  recommendedAsset: "ETC",
  defaultQuantity: "5",
  frames: {
    ETC: [2n, 3n, 3n, 3n, 3n, 3n, 3n].map((x) => x * 1000000n),
    SOL: Array(7).fill(100000000n),
    BTC: Array(7).fill(2000000000n),
  },
};
test("T2: exact decimal limits and independent six/twelve-place products", () => {
  assert.equal(decimal("0.000001"), 1n);
  assert.equal(format(decimal("9223372036854.775807")), "9223372036854.775807");
  assert.equal(
    cash(product(quantity("0.000001", "ETC"), decimal("0.000001"))),
    "0.000000000001",
  );
  for (const q of [
    0,
    1,
    null,
    "0",
    "-1",
    "+1",
    "01",
    ".1",
    "1e2",
    "1.",
    "1.0000001",
    "NaN",
    "Infinity",
    "9223372036854.775808",
    "1".repeat(26),
    " 1",
    "１",
  ])
    err(() => decimal(q), "INVALID_COMMAND");
  err(() => checked(MAX + 1n), "INVALID_COMMAND");
  err(() => product(MAX, 1000000n), "INVALID_COMMAND");
});
test("T2: fills immediately; exact balance, reject without effects and bounded order count", () => {
  const f = setup();
  f.start();
  const before = f.book.state();
  f.order();
  let s = f.book.state();
  assert.equal(s.demoUsd, "990.00");
  assert.equal(s.holdings[0].quantity, "5");
  assert.equal(s.lesson!.orders[0].status, "FILLED");
  assert.equal(s.lesson!.orders[0].price, "2");
  for (const [side, q, symbol, code] of [
    ["buy", "1000", "ETC", "INSUFFICIENT_AVAILABLE_FUNDS"],
    ["sell", "6", "ETC", "INSUFFICIENT_AVAILABLE_FUNDS"],
    ["sell", "1", "SOL", "INSUFFICIENT_AVAILABLE_FUNDS"],
    ["buy", 5, "ETC", "INVALID_COMMAND"],
    ["buy", "0.0000001", "ETC", "INVALID_COMMAND"],
    ["buy", "9223372036854.775807", "ETC", "INVALID_COMMAND"],
    ["buy", "1", "BTC", "INSUFFICIENT_AVAILABLE_FUNDS"],
  ] as const) {
    const state = f.book.state();
    err(() => f.order(side, q, symbol), code);
    assert.deepEqual(f.book.state(), state);
  }
  f.order("buy", "0.000001", "SOL");
  f.order("buy", "0.000001", "BTC");
  for (let i = 3; i < 256; i++) f.order("buy", "0.000001");
  const full = f.book.state();
  err(() => f.order("buy", "0.000001"), "INVALID_COMMAND");
  assert.deepEqual(f.book.state(), full);
  assert.equal(before.demoUsd, "1000.00");
});
test("T3: first acceptance anchors60+20, optional orders/retries do not reset, FF uses endpoint", () => {
  const f = setup();
  f.start();
  err(() => f.finish(), "FAST_FORWARD_NOT_READY");
  f.time(20000);
  const first = f.order("buy", "5", "ETC", "first-order-key");
  f.time(50000);
  f.order("buy", "1");
  f.order("buy", "5", "ETC", "first-order-key");
  f.time(79999);
  assert.equal(f.book.state().lesson!.observation.stage, "observe");
  f.time(80000);
  assert.equal(f.book.state().lesson!.observation.stage, "review");
  f.time(99999);
  assert.equal(f.book.state().lesson!.canFastForward, false);
  err(() => f.finish(), "FAST_FORWARD_NOT_READY");
  f.time(100000);
  assert.equal(f.book.state().lesson!.canFastForward, true);
  f.finish("finish-stable-key");
  const s = f.book.state();
  assert.equal(s.lesson!.status, "ended");
  assert.equal(s.lesson!.result!.settlements[0].price, "2.05");
  assert.equal(s.completedScenarios, 1);
  assert.equal(f.order("buy", "5", "ETC", "first-order-key").replayed, true);
  assert.deepEqual(f.book.state(), s);
  assert.equal(first.receipt.attemptId, s.lesson!.id);
});
test("T3: late valid orders170s/179999ms pass at180; exactly180 rejects; no-order expiry fails", () => {
  for (const ms of [170000, 179999]) {
    const f = setup();
    f.start();
    f.time(ms);
    f.order();
    assert.equal(f.book.state().lesson!.canFastForward, false);
    f.time(180000);
    const s = f.book.state();
    assert.equal(s.completedScenarios, 1);
    assert.equal(s.lesson!.assessment, "passed");
    assert.equal(s.lesson!.result!.settlements.length, 1);
    assert.deepEqual(f.book.state(), s);
    err(() => f.order(), "SESSION_COMPLETED");
  }
  const f = setup();
  f.start();
  f.time(180000);
  err(() => f.order(), "SESSION_COMPLETED");
  assert.equal(f.book.state().lesson!.assessment, "not-passed");
  assert.equal(f.book.state().completedScenarios, 0);
  assert.equal(f.book.state().demoUsd, "1000.00");
  const g = setup();
  g.start();
  g.time(100000);
  g.order();
  g.time(180000);
  assert.equal(g.book.state().lesson!.canFastForward, false);
  assert.equal(g.book.state().lesson!.assessment, "passed");
});
test("T4: lesson purchases sold first; exact independent1005cash+20ETC with cash+5/equity+25", () => {
  const f = setup("20", [independent]);
  const id = f.start();
  f.order();
  f.time(30000);
  f.order("sell", "3");
  f.time(180000);
  const s = f.book.state(),
    r = f.book.report(id);
  assert.equal(s.demoUsd, "1005.00");
  assert.equal(s.holdings[0].quantity, "20");
  assert.equal(r.result.cashChange, "5.00");
  assert.equal(r.result.portfolioValueChange, "25.00");
  assert.equal(r.result.settlements[0].quantity, "2");
  assert.equal(r.opening.portfolioValue, "1040.00");
  assert.equal(r.closing.portfolioValue, "1065.00");
  for (let i = 0; i < 3; i++) assert.deepEqual(f.book.state(), s);
  err(() => f.finish(), "SESSION_COMPLETED");
  assert.equal(f.book.state().demoUsd, "1005.00");
});
test("T4: intentional older-asset sales stay sold; unrelated assets preserved and no new allocation", () => {
  const f = setup("20", [independent]);
  f.start();
  f.order();
  f.time(30000);
  f.order("sell", "7");
  f.order("buy", "1", "SOL");
  f.time(180000);
  assert.equal(f.book.state().holdings[0].quantity, "18");
  assert.equal(f.book.state().demoUsd, "1011.00");
  f.start();
  assert.equal(f.book.state().demoUsd, "1011.00");
  assert.equal(f.book.state().lesson!.practice, true);
  assert.equal(f.book.state().lesson!.wallet.holdings[0].quantity, "20");
});
test("T5: keyed start/retry after expiry confirms original, active same-variant resumes, new intent deliberate", () => {
  const f = setup();
  const id = f.start(undefined, "stable-start-key");
  f.time(30000);
  assert.equal(f.start(undefined, "resume-start-key"), id);
  f.time(190000);
  assert.equal(f.start(undefined, "stable-start-key"), id);
  assert.equal(f.book.state().lesson!.status, "ended");
  assert.notEqual(f.start(undefined, "new-start-key"), id);
  const state = f.book.state();
  err(() => f.book.command({ action: "start" }), "INVALID_COMMAND");
  assert.deepEqual(f.book.state(), state);
  err(
    () => f.start("market-sol", "stable-start-key"),
    "IDEMPOTENCY_KEY_CONFLICT",
  );
  err(() => f.start("market-sol"), "ACTIVE_SESSION_EXISTS");
  err(
    () =>
      f.book.command({
        action: "order",
        intentId: "fake-price-key",
        attemptId: f.book.state().lesson!.id,
        symbol: "ETC",
        side: "buy",
        quantity: "5",
        price: "1",
      }),
    "INVALID_COMMAND",
  );
});
test("T5/T6: receipts survive new attempt, bind exact payload; reports frozen and active future frames hidden", () => {
  const f = setup();
  const id = f.start();
  const command = {
    action: "order",
    intentId: "stable-order-key",
    attemptId: id,
    symbol: "ETC",
    side: "buy",
    quantity: "5",
  };
  const old = f.book.command(command);
  assert.equal(f.book.state().lesson!.quotes[0].history.length, 1);
  err(() => f.book.report(id), "NOT_FOUND");
  f.time(180000);
  const r = f.book.report(id);
  r.closing.cash = "corrupt";
  r.result.settlements[0].quantity = "999";
  assert.notEqual(f.book.report(id).closing.cash, "corrupt");
  f.start();
  const before = f.book.state();
  assert.deepEqual(f.book.command(command), {
    receipt: old.receipt,
    replayed: true,
  });
  assert.deepEqual(f.book.state(), before);
  err(
    () => f.book.command({ ...command, quantity: "6" }),
    "IDEMPOTENCY_KEY_CONFLICT",
  );
  assert.equal(f.book.report(id).quotes[0].history.length, 7);
});
test("T1/T6: three distinct credits, no profit gate, generator once, practice completely isolated", () => {
  const f = setup("20");
  let lastAward: string | null = null;
  for (let i = 0; i < 3; i++) {
    f.start(SCENARIOS[i].id);
    f.order(i === 0 ? "sell" : "buy", i === 0 ? "1" : "0.000001");
    f.book.advance(f.book.state().lesson!.id, 180);
    assert.equal(f.book.state().completedScenarios, i + 1);
    assert.equal(f.book.state().canUsePerpetuals, false);
    if (i === 0) {
      const real = f.book.state();
      const id = f.start(SCENARIOS[0].id);
      assert.equal(f.book.state().lesson!.practice, true);
      assert.equal(f.book.state().lesson!.wallet.cash, "1000.00");
      f.order("sell", "2");
      assert.equal(f.book.state().demoUsd, real.demoUsd);
      f.book.advance(id, 180);
      const after = f.book.state();
      assert.equal(after.demoUsd, real.demoUsd);
      assert.deepEqual(after.holdings, real.holdings);
      assert.equal(after.completedScenarios, 1);
      assert.equal(after.generator.earned, false);
    }
  }
  const s = f.book.state();
  assert.equal(s.generator.earned, true);
  lastAward = s.generator.awardedAt;
  assert.equal(s.generator.productionAvailable, true);
  assert.equal(s.course.gtcPrerequisitesMet, true);
  assert.equal(s.course.gtcAvailable, true);
  const id = f.start();
  f.order();
  f.book.advance(id, 180);
  assert.equal(f.book.state().generator.awardedAt, lastAward);
  assert.equal(f.book.state().completedScenarios, 3);
});
test("T8: developer offset only affects lesson; deadline remains original and award uses real completion", () => {
  const f = setup();
  const id = f.start();
  const original = f.book.state().lesson!.expiresAt;
  for (const n of [0, -1, 181, 1.5, "20", NaN])
    err(() => f.book.advance(id, n), "INVALID_COMMAND");
  err(() => f.book.advance("other", 20), "NOT_FOUND");
  f.order();
  f.book.advance(id, 60);
  assert.equal(f.book.state().lesson!.observation.stage, "review");
  f.book.advance(id, 20);
  assert.equal(f.book.state().lesson!.canFastForward, true);
  assert.equal(f.book.state().lesson!.expiresAt, original);
  assert.equal(f.now(), 1000000);
  f.book.advance(id, 180);
  assert.equal(
    f.book.state().lesson!.result!.completedAt,
    new Date(1000000).toISOString(),
  );
});
test("F1/T8 HTTP: owner reports, keyed alias, strict commands, new paths revoke auth and production dev tools404", async () => {
  resetDemoStore();
  const call = (
    action: Parameters<typeof handleMockRequest>[1],
    token?: string,
    body?: unknown,
    query = "",
  ) =>
    handleMockRequest(
      new Request("http://localhost/api/mock/" + action + query, {
        method: ["state", "report"].includes(action) ? "GET" : "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      action,
    );
  const login = await (
    await call("sign-in", undefined, {
      username: "learner",
      pin: "0073",
      deviceId: "A",
    })
  ).json();
  assert.equal((await call("start-lesson", login.token)).status, 400);
  const started = await (
    await call("start-lesson", login.token, { intentId: "alias-start-key" })
  ).json();
  assert.equal(
    (
      await call("command", login.token, {
        action: "order",
        intentId: "http-order-key",
        attemptId: started.lesson.id,
        symbol: "ETC",
        side: "buy",
        quantity: "5",
        owner: "trader",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("dev-advance", login.token, {
        attemptId: started.lesson.id,
        seconds: 180,
      })
    ).status,
    200,
  );
  const retry = await (
    await call("start-lesson", login.token, { intentId: "alias-start-key" })
  ).json();
  assert.equal(retry.lesson.id, started.lesson.id);
  assert.equal(retry.lesson.status, "ended");
  assert.equal(
    (
      await call(
        "report",
        login.token,
        undefined,
        "?attemptId=" + started.lesson.id,
      )
    ).status,
    200,
  );
  const trader = await (
    await call("sign-in", undefined, {
      username: "trader",
      pin: "0042",
      deviceId: "X",
    })
  ).json();
  assert.equal(
    (
      await call(
        "report",
        trader.token,
        undefined,
        "?attemptId=" + started.lesson.id,
      )
    ).status,
    404,
  );
  assert.equal(
    (await call("report", trader.token, undefined, "?attemptId=unknown"))
      .status,
    404,
  );
  await call("sign-in", undefined, {
    username: "learner",
    pin: "0073",
    deviceId: "B",
  });
  for (const [action, body, query] of [
    ["command", { action: "start", intentId: "old-command-key" }, ""],
    ["report", undefined, "?attemptId=" + started.lesson.id],
    ["dev-advance", { attemptId: started.lesson.id, seconds: 20 }, ""],
  ] as const) {
    const r = await call(action, login.token, body, query);
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error.code, "SESSION_REPLACED");
  }
  const env = process.env as Record<string, string | undefined>,
    before = env.NODE_ENV;
  try {
    env.NODE_ENV = "production";
    for (const action of ["dev-reset", "dev-advance"] as const)
      assert.equal((await call(action, login.token, {})).status, 404);
  } finally {
    if (before === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = before;
  }
});
test("F1: changing devices preserves real orders/wallet/deadline; accounts remain isolated", () => {
  let now = 1000;
  const s = new DemoStore(() => now);
  const a = s.signIn("learner", "0073", "A");
  const id = s.startLesson(a.token, "store-start-key").lesson!.id;
  s.command(a.token, {
    action: "order",
    intentId: "store-order-key",
    attemptId: id,
    symbol: "ETC",
    side: "buy",
    quantity: "5",
  });
  now += 30000;
  const b = s.signIn("learner", "0073", "B");
  assert.equal(b.state.lesson!.id, id);
  assert.equal(b.state.demoUsd, "971.5775");
  assert.equal(b.state.lesson!.remainingSeconds, 150);
  assert.equal(s.signIn("visitor", "0000", "C").state.demoUsd, "1000.00");
  for (const action of [
    () => s.command(a.token, {}),
    () => s.report(a.token, id),
    () => s.advance(a.token, id, 20),
  ])
    err(action, "SESSION_REPLACED");
});

test("T3/T4: Fast-forward freezes the ended view at the same endpoint as settlement/report, including prior holdings", () => {
  const f = setup("20");
  const id = f.start();
  f.order();
  f.time(80000);
  f.finish();
  const ended = f.book.state(),
    r = f.book.report(id);
  assert.equal(ended.lesson!.remainingSeconds, 0);
  assert.equal(ended.lesson!.elapsedSeconds, 180);
  assert.equal(ended.lesson!.quotes[0].price, "2.05");
  assert.equal(ended.lesson!.wallet.portfolioValue, "1041.25");
  assert.equal(ended.lesson!.portfolioValueChange, "1.25");
  assert.deepEqual(ended.lesson!.wallet, r.closing);
  assert.equal(
    ended.lesson!.portfolioValueChange,
    r.result.portfolioValueChange,
  );
  assert.equal(ended.holdings[0].value, "41.00");
  for (const ms of [90000, 120000, 190000, 1000000]) {
    f.time(ms);
    assert.deepEqual(f.book.state(), ended);
    assert.deepEqual(f.book.report(id), r);
  }
});
