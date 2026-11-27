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
import { ALL_SCENARIOS, fixedMarks } from "./test-fixtures.ts";
import { DemoError } from "../errors.ts";
import { resetDemoStore } from "../store.ts";
import { handleMockRequest } from "../handler.ts";
import type { LessonId, OrderDraft } from "../../api/market-types.ts";
const err = (f: () => unknown, code: string) =>
  assert.throws(f, (e) => e instanceof DemoError && e.code === code);
function setup(owned = "0", scenarios = ALL_SCENARIOS) {
  let now = 1000000,
    seq = 0;
  const b = new MarketBook(() => now, owned, scenarios);
  const key = () => `intent-${++seq}-key`;
  const start = (variantId?: string) =>
    b.command({
      action: "start",
      intentId: key(),
      ...(variantId ? { variantId } : {}),
    }).receipt.attemptId;
  const draft = (extra: Partial<OrderDraft> = {}): OrderDraft => ({
    attemptId: b.state().lesson!.id,
    symbol: "ETC",
    side: "buy",
    quantity: "1",
    ...extra,
  });
  const order = (extra: Partial<OrderDraft> = {}, intentId = key()) =>
    b.command({ action: "order", intentId, ...draft(extra) });
  const advance = (seconds: number) => b.advance(b.state().lesson!.id, seconds);
  const finish = (intentId = key()) =>
    b.command({ action: "finish", intentId, attemptId: b.state().lesson!.id });
  const completeLesson = (lessonId: LessonId) => {
    for (const s of ALL_SCENARIOS.filter((s) => s.lessonId === lessonId)) {
      start(s.id);
      if (lessonId === "market") {
        order();
        order({ side: "sell" });
      } else if (lessonId === "gtc")
        order({ orderType: "LIMIT", timeInForce: "GTC", limitPrice: "1.5" });
      else if (lessonId === "ioc-fok") {
        order({ orderType: "LIMIT", timeInForce: "IOC", limitPrice: "3" });
        order({ orderType: "LIMIT", timeInForce: "FOK", limitPrice: "3" });
      } else
        order({
          orderType: "STOP_LIMIT",
          timeInForce: "GTC",
          limitPrice: "2.05",
          stopPrice: "3",
        });
      advance(180);
      assert.equal(b.state().lesson!.assessment, "passed");
    }
    fixedMarks(b);
  };
  return {
    b,
    key,
    start,
    draft,
    order,
    advance,
    finish,
    completeLesson,
    wall: (ms: number) => {
      now += ms;
    },
  };
}
test("L: full12 distinct course, prerequisites, two starter awards and no practice farming", () => {
  const f = setup();
  err(() => f.start("gtc-etc"), "LESSON_LOCKED");
  err(() => f.start("stop-limit-etc"), "LESSON_LOCKED");
  for (const id of ["market", "gtc", "ioc-fok", "stop-limit"] as const) {
    f.completeLesson(id);
    assert.equal(
      f.b.state().course.lessons.find((l) => l.id === id)!.completed,
      3,
    );
  }
  const s = f.b.state();
  assert.equal(s.course.totalCompletedScenarios, 12);
  assert.equal(s.course.spotPrerequisitesMet, true);
  assert.equal(s.canUsePerpetuals, true);
  assert.deepEqual(
    s.generators.map((g) => g.earned),
    [true, true],
  );
  assert.equal(s.generators[1].productionAvailable, true);
  assert.equal(s.generators[1].capacity, "0.005");
  f.start("gtc-etc");
  f.order({ orderType: "LIMIT", timeInForce: "GTC", limitPrice: "1.5" });
  f.advance(180);
  assert.equal(f.b.state().course.totalCompletedScenarios, 12);
  assert.equal(f.b.state().demoUsd, s.demoUsd);
  assert.deepEqual(f.b.state().generators, s.generators);
});
test("Q/O: exact max, pending reservations, input preview is read-only and insufficient error has current safe details", () => {
  const f = setup("20");
  f.completeLesson("market");
  f.start("gtc-etc");
  assert.deepEqual(f.b.preview(f.draft()), {
    pendingOrder: null,
    blockedByPendingOrder: false,
    attemptId: f.b.state().lesson!.id,
    symbol: "ETC",
    side: "buy",
    availableCash: "1000.00",
    reservedCash: "0.00",
    availableAsset: "20",
    maxQuantity: "330",
    referencePrice: "2",
    estimatedCost: "2.00",
    valid: true,
    reason: null,
  });
  const before = f.b.state();
  f.b.preview(f.draft({ quantity: "600" }));
  assert.deepEqual(f.b.state(), before);
  f.order({
    quantity: "5",
    orderType: "LIMIT",
    timeInForce: "GTC",
    limitPrice: "1.9",
  });
  const p = f.b.preview(f.draft());
  assert.equal(p.availableCash, "990.50");
  assert.equal(p.reservedCash, "9.50");
  assert.equal(p.maxQuantity, "325");
  assert.throws(
    () => f.order({ quantity: "600" }),
    (e) => {
      if (!(e instanceof DemoError)) return false;
      assert.equal(e.code, "INSUFFICIENT_AVAILABLE_FUNDS");
      assert.deepEqual(e.details, {
        symbol: "ETC",
        side: "buy",
        availableCash: "990.50",
        availableAsset: "20",
        maxQuantity: "325",
        referencePrice: "2",
        requiredCash: "1200.00",
        requestedQuantity: "600",
      });
      return true;
    },
  );
  f.advance(60);
  assert.equal(f.b.state().demoUsd, "990.50");
  assert.equal(f.b.state().lesson!.wallet.reservedCash, "0.00");
  assert.equal(f.b.state().holdings[0].quantity, "25");
});
test("O/S: guided symbol suppresses base frames; exact t10=>70 fill and90 FF; canceled history stays immutable", () => {
  const f = setup();
  f.completeLesson("market");
  f.start("gtc-etc");
  f.advance(10);
  f.order({ orderType: "LIMIT", timeInForce: "GTC", limitPrice: "1.99" });
  f.advance(50);
  let s = f.b.state();
  assert.equal(s.lesson!.orders[0].status, "PENDING");
  assert.equal(s.lesson!.quotes[0].price, "1.995");
  assert.equal(s.lesson!.goals[0].done, false);
  f.advance(9);
  assert.equal(f.b.state().lesson!.orders[0].status, "PENDING");
  f.advance(1);
  s = f.b.state();
  assert.equal(s.lesson!.orders[0].status, "FILLED");
  assert.equal(s.lesson!.orders[0].filledAt, 70);
  assert.equal(s.lesson!.canFastForward, false);
  f.advance(20);
  f.finish();
  const ended = f.b.state(),
    r = f.b.report(ended.lesson!.id);
  assert.equal(ended.lesson!.elapsedSeconds, 180);
  assert.deepEqual(ended.lesson!.wallet, r.closing);
  assert.equal(
    r.events.some((e) => e.second === 70 && e.message.includes("filled")),
    true,
  );
});
test("O: immediate GTC doesn't demonstrate waiting; cancel/retry releases exact reservations; one open guide per asset", () => {
  const f = setup("20");
  f.completeLesson("market");
  f.start("gtc-etc");
  f.order({ orderType: "LIMIT", timeInForce: "GTC", limitPrice: "3" });
  assert.equal(f.b.state().lesson!.goals[0].done, false);
  f.order({
    side: "sell",
    quantity: "5",
    orderType: "LIMIT",
    timeInForce: "GTC",
    limitPrice: "3",
  });
  assert.equal(f.b.preview(f.draft({ side: "sell" })).availableAsset, "16"); //20 existing+1 immediate buy-5 reserved
  const snapshot = f.b.state();
  err(
    () => f.order({ orderType: "LIMIT", timeInForce: "GTC", limitPrice: "1" }),
    "ACTIVE_ORDER_EXISTS",
  );
  assert.deepEqual(f.b.state(), snapshot);
  const id = f.b.state().lesson!.orders[1].id,
    command = {
      action: "cancel",
      intentId: "cancel-stable-key",
      attemptId: f.b.state().lesson!.id,
      orderId: id,
    };
  f.b.command(command);
  assert.equal(f.b.preview(f.draft({ side: "sell" })).availableAsset, "21");
  const canceled = f.b.state();
  f.b.command(command);
  assert.deepEqual(f.b.state(), canceled);
  err(() => f.b.command({ ...command, intentId: f.key() }), "INVALID_COMMAND");
  f.advance(180);
  assert.equal(f.b.state().lesson!.assessment, "not-passed");
});
test("O: pending fill due exactly180 precedes settlement; after180 cancels and fails; preview reconciles only previously scheduled trade", () => {
  for (const accepted of [120, 121]) {
    const f = setup();
    f.completeLesson("market");
    f.start("gtc-etc");
    f.advance(accepted);
    f.order({ orderType: "LIMIT", timeInForce: "GTC", limitPrice: "1.5" });
    f.advance(180 - accepted);
    const s = f.b.state();
    assert.equal(
      s.lesson!.assessment,
      accepted === 120 ? "passed" : "not-passed",
    );
    assert.equal(
      s.lesson!.orders[0].status,
      accepted === 120 ? "FILLED" : "CANCELED",
    );
    assert.equal(s.lesson!.wallet.reservedCash, "0.00");
    assert.equal(s.lesson!.canFastForward, false);
  }
  const f = setup();
  f.completeLesson("market");
  f.start("gtc-etc");
  f.order({ orderType: "LIMIT", timeInForce: "GTC", limitPrice: "1.9" });
  f.wall(60000);
  const p = f.b.preview(f.draft({ quantity: "5" }));
  assert.equal(p.availableCash, "998.10");
  assert.equal(f.b.state().lesson!.orders.length, 1);
  assert.equal(f.b.state().lesson!.orders[0].status, "FILLED");
});
test("I: IOC/FOK immediate fill or cancel, both required,20/40=>120 and optional/retry doesn't reset", () => {
  const f = setup();
  f.completeLesson("market");
  f.completeLesson("gtc");
  f.start("ioc-fok-etc");
  f.order({ orderType: "LIMIT", timeInForce: "IOC", limitPrice: "1" });
  assert.equal(f.b.state().lesson!.orders[0].status, "CANCELED");
  assert.equal(f.b.state().lesson!.goals[0].done, false);
  assert.equal(f.b.state().lesson!.wallet.reservedCash, "0.00");
  f.advance(20);
  const d = f.draft({
    orderType: "LIMIT",
    timeInForce: "IOC",
    limitPrice: "3",
  });
  f.b.command({ action: "order", intentId: "ioc-stable-key", ...d });
  f.advance(20);
  f.order({ orderType: "LIMIT", timeInForce: "FOK", limitPrice: "3" });
  f.advance(60);
  assert.equal(f.b.state().lesson!.canFastForward, false);
  f.b.command({ action: "order", intentId: "ioc-stable-key", ...d });
  f.order({ orderType: "LIMIT", timeInForce: "IOC", limitPrice: "3" });
  f.advance(19);
  assert.equal(f.b.state().lesson!.canFastForward, false);
  f.advance(1);
  assert.equal(f.b.state().lesson!.canFastForward, true);
  f.finish();
  assert.equal(f.b.state().lesson!.assessment, "passed");
});
test("I: one filled policy or two canceled policies never pass; completed late outcomes may pass without full review", () => {
  for (const quantity of [1, 2]) {
    const f = setup();
    f.completeLesson("market");
    f.completeLesson("gtc");
    f.start("ioc-fok-etc");
    f.order({
      orderType: "LIMIT",
      timeInForce: "IOC",
      limitPrice: quantity === 1 ? "3" : "1",
    });
    if (quantity === 2)
      f.order({ orderType: "LIMIT", timeInForce: "FOK", limitPrice: "1" });
    f.advance(180);
    assert.equal(f.b.state().lesson!.assessment, "not-passed");
  }
  const f = setup();
  f.completeLesson("market");
  f.completeLesson("gtc");
  f.start("ioc-fok-etc");
  f.advance(170);
  for (const timeInForce of ["IOC", "FOK"] as const)
    f.order({ orderType: "LIMIT", timeInForce, limitPrice: "3" });
  f.advance(10);
  assert.equal(f.b.state().lesson!.assessment, "passed");
  assert.equal(f.b.state().lesson!.canFastForward, false);
});
test("S: stop remains dormant then triggers and later fills; impossible positive tick and extreme path reject atomically", () => {
  const f = setup("20");
  f.completeLesson("market");
  f.completeLesson("gtc");
  f.completeLesson("ioc-fok");
  f.start("stop-limit-etc");
  for (const extra of [
    { stopPrice: "1", limitPrice: "2" },
    { stopPrice: "3", limitPrice: "9223372036854.775807" },
    { side: "sell" as const, stopPrice: "1", limitPrice: "0.000001" },
  ]) {
    const before = f.b.state();
    err(
      () => f.order({ orderType: "STOP_LIMIT", timeInForce: "GTC", ...extra }),
      "INVALID_COMMAND",
    );
    assert.deepEqual(f.b.state(), before);
  }
  f.order({
    orderType: "STOP_LIMIT",
    timeInForce: "GTC",
    stopPrice: "2.1",
    limitPrice: "2.05",
  });
  f.advance(29);
  assert.equal(f.b.state().lesson!.orders[0].status, "PENDING");
  f.advance(1);
  assert.equal(f.b.state().lesson!.orders[0].status, "TRIGGERED");
  assert.equal(f.b.state().lesson!.goals[0].done, false);
  f.advance(29);
  assert.equal(f.b.state().lesson!.orders[0].status, "TRIGGERED");
  f.advance(1);
  assert.equal(f.b.state().lesson!.orders[0].status, "FILLED");
  assert.equal(f.b.state().lesson!.goals[0].done, true);
  f.advance(20);
  f.finish();
  const report = f.b.report(f.b.state().lesson!.id);
  assert.equal(report.orders[0].triggeredAt, 30);
  assert.equal(report.orders[0].filledAt, 60);
  const times = report.events.map((e) => e.second);
  assert.deepEqual(
    times,
    [...times].sort((a, b) => a - b),
  );
});
test("G/D: collection is between demonstrations; accepted receipt recovers while active without another debit", () => {
  const f = setup();
  f.completeLesson("market");
  f.b.advanceResources(1);
  const c = { action: "collect", intentId: "collect-stable-key", asset: "ETC" };
  f.b.command(c);
  assert.equal(f.b.state().holdings[0].quantity, "1");
  assert.equal(f.b.state().generators[0].stored, "0");
  f.start("gtc-etc");
  const before = f.b.state();
  assert.equal(f.b.command(c).replayed, true);
  assert.deepEqual(f.b.state(), before);
  err(() => f.b.command({ ...c, intentId: f.key() }), "ACTIVE_DEMONSTRATION");
  assert.deepEqual(f.b.state(), before);
  f.order({ orderType: "LIMIT", timeInForce: "GTC", limitPrice: "1.9" });
  f.advance(180);
  assert.equal(f.b.state().lesson!.result!.resourceInflows.length, 0);
  f.start("market-etc");
  assert.equal(f.b.state().lesson!.practice, true);
  f.b.advanceResources(1);
  const practice = f.b.state();
  err(() => f.b.command({ ...c, intentId: f.key() }), "ACTIVE_DEMONSTRATION");
  assert.deepEqual(f.b.state(), practice);
});
test("D/Q/H HTTP: previews strict, exact funds envelope, owners/revocation on new routes and all dev helpers404 in production", async () => {
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
  const started = await (
    await call("start-lesson", a.token, { intentId: "http-start-key" })
  ).json();
  const d = {
    attemptId: started.lesson.id,
    symbol: "ETC",
    side: "buy",
    quantity: "600",
  };
  assert.equal(
    (await call("order-preview", a.token, { ...d, availableCash: "99999" }))
      .status,
    400,
  );
  const p = await (await call("order-preview", a.token, d)).json();
  assert.equal(p.preview.maxQuantity, "175.916967");
  assert.equal(p.preview.valid, false);
  const e = await call("command", a.token, {
    action: "order",
    intentId: "http-funds-key",
    ...d,
  });
  assert.equal(e.status, 409);
  assert.deepEqual((await e.json()).error, {
    code: "INSUFFICIENT_AVAILABLE_FUNDS",
    message: "Not enough Demo USD for this order.",
    details: {
      symbol: "ETC",
      side: "buy",
      availableCash: "1000.00",
      availableAsset: "0",
      maxQuantity: "175.916967",
      referencePrice: "5.6845",
      requiredCash: "3410.70",
      requestedQuantity: "600",
    },
  });
  const b = await (
    await call("sign-in", undefined, {
      username: "learner",
      pin: "0073",
      deviceId: "B",
    })
  ).json();
  for (const action of ["order-preview", "dev-resources"] as const) {
    const r = await call(
      action,
      a.token,
      action === "order-preview" ? d : { hours: 1 },
    );
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error.code, "SESSION_REPLACED");
  }
  assert.equal(
    (
      await call("order-preview", b.token, {
        ...d,
        attemptId: "11111111-1111-4111-8111-111111111111",
      })
    ).status,
    404,
  );
  const env = process.env as Record<string, string | undefined>,
    previous = env.NODE_ENV;
  try {
    env.NODE_ENV = "production";
    for (const action of ["dev-reset", "dev-advance", "dev-resources"] as const)
      assert.equal((await call(action, b.token, { hours: 1 })).status, 404);
  } finally {
    if (previous === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous;
  }
});

test("H: browser runtime dependency graph cannot import mock business modules", async () => {
  const fs = await import("node:fs"),
    path = await import("node:path");
  const root = path.resolve("src"),
    seen = new Set<string>();
  function walk(file: string): void {
    if (seen.has(file)) return;
    seen.add(file);
    assert.equal(
      file.startsWith(path.join(root, "mocks")),
      false,
      "Business module reached browser graph: " + file,
    );
    const source = fs.readFileSync(file, "utf8");
    // Traverse this project's static runtime imports; type-only DTO links do not ship code.
    const imports = [
      ...source.matchAll(
        /^import\s+(?!type\b)[\s\S]*?\bfrom\s*["']([^"']+)["']/gm,
      ),
      ...source.matchAll(/import\(["']([^"']+)["']\)/g),
    ];
    for (const match of imports) {
      const name = match[1];
      if (!name.startsWith(".") && !name.startsWith("@/")) continue;
      const base = name.startsWith("@/")
        ? path.join(root, name.slice(2))
        : path.resolve(path.dirname(file), name);
      const target = [
        base,
        base + ".ts",
        base + ".tsx",
        path.join(base, "index.ts"),
      ].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (target) walk(target);
    }
  }
  walk(path.join(root, "features/identity/PlayerApp.tsx"));
  assert.ok(seen.has(path.join(root, "api/client.ts")));
  assert.ok(seen.has(path.join(root, "features/trading/OrderForm.tsx")));
});

test("Q/I: non-guided limit prices never become future market quotes; canceled IOC/FOK do not reserve projected holdings", () => {
  const f = setup("20");
  f.completeLesson("market");
  f.completeLesson("gtc");
  f.start("ioc-fok-etc");
  for (const timeInForce of ["IOC", "FOK"] as const) {
    const d = f.draft({
      side: "sell",
      quantity: "1",
      orderType: "LIMIT",
      timeInForce,
      limitPrice: "500000",
    });
    assert.equal(f.b.preview(d).valid, true);
    f.order(d);
    const s = f.b.state();
    assert.equal(s.lesson!.orders.at(-1)!.status, "CANCELED");
    assert.equal(s.lesson!.quotes[0].price, "2");
    assert.equal(s.holdings[0].quantity, "20");
  }
  const d = f.draft({
    quantity: "100000000",
    orderType: "LIMIT",
    timeInForce: "IOC",
    limitPrice: "0.000001",
  });
  assert.equal(f.b.preview(d).valid, false);
  const before = f.b.state();
  err(() => f.order(d), "DESTINATION_STORAGE_FULL");
  assert.deepEqual(f.b.state(), before);
  assert.equal(f.b.state().holdings[0].quantity, "20");
});
test("G/D: partial collection fits fixed wallet capacity and leaves the remainder in its collector", () => {
  const f = setup();
  f.completeLesson("market");
  f.b.advanceResources(60);
  const d = f.b.dump();
  d.wallet.quantities.ETC = 34900000000n;
  f.b.restore(d);
  const c = {
    action: "collect",
    intentId: "partial-collection-key",
    asset: "ETC",
  };
  f.b.command(c);
  const s = f.b.state();
  assert.equal(s.holdings[0].quantity, "350");
  assert.equal(s.generators[0].stored, "49");
  assert.equal(f.b.command(c).replayed, true);
  assert.deepEqual(f.b.state(), s);
  err(
    () => f.b.command({ ...c, intentId: f.key() }),
    "DESTINATION_STORAGE_FULL",
  );
  assert.deepEqual(f.b.state(), s);
});
test("Q: preview missing quantity is an empty advisory draft; invalid JSON money types still reject", () => {
  const f = setup();
  f.start();
  const { quantity: _, ...empty } = f.draft();
  const before = f.b.state();
  const p = f.b.preview(empty);
  assert.equal(p.valid, false);
  assert.equal(p.availableCash, "1000.00");
  assert.equal(p.maxQuantity, "350");
  assert.deepEqual(f.b.state(), before);
  err(() => f.b.preview({ ...empty, quantity: 1 }), "INVALID_COMMAND");
});

test("G/D: practice collection independently protects the real wallet when there is no working-wallet commit", () => {
  const scenarios = structuredClone(ALL_SCENARIOS);
  scenarios.find((s) => s.id === "gtc-etc")!.frames.ETC[4] = 140000000000n;
  const f = setup("20", scenarios);
  f.completeLesson("market");
  f.start("gtc-etc");
  f.order({ orderType: "LIMIT", timeInForce: "GTC", limitPrice: "1.9" });
  f.advance(180);
  assert.equal(f.b.state().lesson!.assessment, "passed");
  f.b.advanceResources(60);
  f.start("gtc-etc");
  const before = f.b.state(),
    claim = {
      action: "collect",
      intentId: "practice-overflow-claim-key",
      asset: "ETC",
    };
  assert.equal(before.lesson!.practice, true);
  assert.equal(before.generators[0].stored, "50");
  // Existing20 plus incoming50 at the authored140000 future mark exceeds the exact supported range.
  err(() => f.b.command(claim), "ACTIVE_DEMONSTRATION");
  assert.deepEqual(f.b.state(), before);
  assert.equal(f.b.state().confirmedIntentIds.includes(claim.intentId), false);
  assert.equal(f.b.state().holdings[0].quantity, "20");
  assert.equal(f.b.state().lesson!.wallet.holdings[0].quantity, "20");
});

test("P: accepted pending context is copied, draft-specific blockage is server-owned, and genuine invalid/funds failures stay errors", () => {
  const f = setup("20");
  f.completeLesson("market");
  f.start("gtc-sol");
  const d = f.draft({
    symbol: "SOL",
    quantity: "1",
    orderType: "LIMIT",
    timeInForce: "GTC",
    limitPrice: "97.375",
  });
  f.order(d);
  const before = f.b.state();
  const p = f.b.preview(d);
  assert.equal(p.valid, false);
  assert.equal(p.blockedByPendingOrder, true);
  assert.equal(p.pendingOrder!.id, before.lesson!.orders[0].id);
  assert.equal(p.pendingOrder!.quantity, "1");
  assert.equal(p.pendingOrder!.limitPrice, "97.375");
  assert.equal(p.reservedCash, "97.375");
  assert.equal(p.availableCash, "902.625");
  assert.deepEqual(f.b.state(), before);
  p.pendingOrder!.quantity = "999";
  assert.equal(f.b.state().lesson!.orders[0].quantity, "1");
  for (const extra of [
    { quantity: "" },
    { quantity: "abc" },
    { limitPrice: "abc" },
    { quantity: "1000" },
  ]) {
    const draft = { ...d, ...extra },
      preview = f.b.preview(draft);
    assert.equal(preview.blockedByPendingOrder, false);
    assert.equal(preview.valid, false);
    assert.equal(preview.pendingOrder!.id, before.lesson!.orders[0].id);
    assert.notEqual(preview.reason, null);
    assert.deepEqual(f.b.state(), before);
    err(
      () => f.order(draft),
      extra.quantity === "1000"
        ? "INSUFFICIENT_AVAILABLE_FUNDS"
        : "INVALID_COMMAND",
    );
    assert.deepEqual(f.b.state(), before);
  }
  err(() => f.order(d), "ACTIVE_ORDER_EXISTS");
  assert.deepEqual(f.b.state(), before);
  f.b.command({
    action: "cancel",
    intentId: f.key(),
    attemptId: before.lesson!.id,
    orderId: before.lesson!.orders[0].id,
  });
  const cleared = f.b.preview(d);
  assert.equal(cleared.blockedByPendingOrder, false);
  assert.equal(cleared.pendingOrder, null);
  assert.equal(cleared.valid, true);
});
test("P: same-asset IOC cancellation, market and matchable limit remain allowed while GTC or stop waits", () => {
  for (const lesson of ["gtc", "stop-limit"] as const) {
    const f = setup("20");
    f.completeLesson("market");
    if (lesson === "stop-limit") {
      f.completeLesson("gtc");
      f.completeLesson("ioc-fok");
    }
    f.start(lesson + "-etc");
    const d = f.draft({
      orderType: lesson === "gtc" ? "LIMIT" : "STOP_LIMIT",
      timeInForce: "GTC",
      limitPrice: lesson === "gtc" ? "1.9" : "2.05",
      ...(lesson === "stop-limit" ? { stopPrice: "2.1" } : {}),
    });
    f.order(d);
    const original = f.b.state().lesson!.orders[0];
    const reserved = f.b.state().lesson!.wallet.reservedCash;
    if (lesson === "stop-limit") {
      const before = f.b.state();
      for (const stopPrice of ["", "abc", "0"]) {
        const invalid = { ...d, stopPrice };
        const preview = f.b.preview(invalid);
        assert.equal(preview.valid, false);
        assert.equal(preview.blockedByPendingOrder, false);
        assert.equal(preview.pendingOrder!.id, original.id);
        assert.notEqual(preview.reason, null);
        assert.deepEqual(f.b.state(), before);
        err(() => f.order(invalid), "INVALID_COMMAND");
        assert.deepEqual(f.b.state(), before);
      }
    }
    const ioc = f.draft({
      orderType: "LIMIT",
      timeInForce: "IOC",
      limitPrice: "1",
    });
    assert.equal(f.b.preview(ioc).blockedByPendingOrder, false);
    assert.equal(f.b.preview(ioc).valid, true);
    f.order(ioc);
    let s = f.b.state();
    assert.equal(s.lesson!.orders[1].status, "CANCELED");
    assert.equal(s.lesson!.orders[0].id, original.id);
    assert.equal(s.lesson!.orders[0].status, "PENDING");
    assert.equal(s.lesson!.wallet.reservedCash, reserved);
    for (const d of [
      f.draft(),
      f.draft({ orderType: "LIMIT", timeInForce: "GTC", limitPrice: "3" }),
    ]) {
      assert.equal(f.b.preview(d).blockedByPendingOrder, false);
      assert.equal(f.b.preview(d).valid, true);
      f.order(d);
    }
    const other = f.b.preview(
      f.draft({
        symbol: "BTC",
        quantity: "0.01",
        orderType: "LIMIT",
        timeInForce: "GTC",
        limitPrice: "1000",
      }),
    );
    assert.equal(other.pendingOrder, null);
    assert.equal(other.blockedByPendingOrder, false);
    assert.equal(other.valid, true);
    f.advance(60);
    const after = f.b.preview(d);
    assert.equal(after.pendingOrder, null);
    assert.equal(after.blockedByPendingOrder, false);
  }
});
