import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoStore, DemoError } from "../store.ts";
import type { OrderDraft } from "../../api/market-types.ts";
function fixture() {
  let now = 0,
    seq = 0;
  const store = new DemoStore(() => now),
    signed = store.signIn("learner", "0073", "A"),
    token = signed.token;
  const command = (input: Record<string, unknown>) =>
    store.command(token, { intentId: `contract-${++seq}-intent`, ...input });
  for (const id of ["market", "gtc", "ioc-fok", "stop-limit"])
    for (const asset of ["etc", "sol", "btc"]) {
      const a = command({ action: "start", variantId: `${id}-${asset}` }).state
          .lesson!,
        symbol = a.recommendedAsset;
      const order = (d: Partial<OrderDraft>) =>
        command({
          action: "order",
          attemptId: a.id,
          symbol,
          side: "buy",
          quantity: a.defaultQuantity,
          ...d,
        });
      if (id === "market") {
        order({});
        order({ side: "sell" });
      } else if (id === "ioc-fok") {
        for (const timeInForce of ["IOC", "FOK"] as const)
          order({
            orderType: "LIMIT",
            timeInForce,
            limitPrice: a.quotes.find((q) => q.symbol === symbol)!.price,
          });
      } else {
        const d = a.form.defaults.find(
          (d) => d.symbol === symbol && d.side === "buy",
        )!;
        order({
          orderType: id === "gtc" ? "LIMIT" : "STOP_LIMIT",
          timeInForce: "GTC",
          limitPrice: d.limitPrice,
          ...(id === "stop-limit" ? { stopPrice: d.stopPrice } : {}),
        });
      }
      store.advance(token, a.id, 180);
    }
  return {
    store,
    token,
    command,
    time: (t: number) => {
      now = t;
    },
  };
}
const err = (f: () => unknown, code: string) =>
  assert.throws(f, (e) => e instanceof DemoError && e.code === code);
test("S01: accepted conversion receipt recovers after quote expiry and during practice without duplicate debit, bonus or cooldown", () => {
  const f = fixture(),
    q = f.store.quote(f.token, {
      kind: "conversion",
      source: "USD",
      destination: "BTC",
    }).quote,
    c = {
      action: "convert",
      intentId: "accepted-conversion-key",
      quoteId: q.id,
    };
  const first = f.store.command(f.token, c);
  const cash = first.state.demoUsd,
    held = first.state.holdings,
    cooldown = first.state.economy.converter.nextAt;
  f.time(31000);
  f.command({ action: "start", variantId: "market-etc" });
  const replay = f.store.command(f.token, c);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.state.lesson!.practice, true);
  assert.equal(replay.state.demoUsd, cash);
  assert.deepEqual(replay.state.holdings, held);
  assert.equal(replay.state.economy.converter.nextAt, cooldown);
  err(
    () => f.store.command(f.token, { ...c, quoteId: "changed-quote-id" }),
    "IDEMPOTENCY_KEY_CONFLICT",
  );
  f.store.advance(f.token, replay.state.lesson!.id, 180);
  err(
    () => f.store.command(f.token, { ...c, intentId: "new-conversion-key" }),
    "QUOTE_NOT_FOUND",
  );
});
test("S02: cross-action intent collision, another player quote and revoked session cannot change the owner wallet", () => {
  const f = fixture(),
    q = f.store.quote(f.token, {
      kind: "conversion",
      source: "USD",
      destination: "BTC",
    }).quote;
  const trader = f.store.signIn("trader", "0042", "B");
  err(
    () =>
      f.store.command(trader.token, {
        action: "convert",
        intentId: "foreign-quote-key",
        quoteId: q.id,
      }),
    "QUOTE_NOT_FOUND",
  );
  const before = f.store.state(f.token);
  f.command({
    action: "answer",
    questionId: "market-value",
    questionRevision: before.economy.questions[0].revision,
    answer: "A",
    intentId: "shared-action-key",
  });
  err(
    () =>
      f.store.command(f.token, {
        action: "convert",
        intentId: "shared-action-key",
        quoteId: q.id,
      }),
    "IDEMPOTENCY_KEY_CONFLICT",
  );
  const after = f.store.state(f.token);
  assert.equal(after.economy.converter.nextAt, null);
  f.store.signIn("learner", "0073", "C");
  for (const action of [
    () =>
      f.store.quote(f.token, {
        kind: "conversion",
        source: "USD",
        destination: "BTC",
      }),
    () =>
      f.store.command(f.token, {
        action: "convert",
        intentId: "revoked-conversion-key",
        quoteId: q.id,
      }),
  ])
    err(action, "SESSION_REPLACED");
  assert.equal(f.store.state(trader.token).demoUsd, "1000.00");
});
