import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketBook } from "../market/book.ts";
import { LESSONS } from "../market/course.ts";
import { EconomyBook } from "./book.ts";
import { DemoError } from "../errors.ts";
import type { OrderDraft, LessonId } from "../../api/market-types.ts";

test("J01: all36 selected scenarios work with the new catalog and coherent continuing prices, without forced unlocks", () => {
  const b = new MarketBook(() => 0),
    e = new EconomyBook(b, () => 0);
  let seq = 0;
  const command = (data: Record<string, unknown>) =>
    b.command({ ...data, intentId: `journey-${++seq}-intent` });
  const order = (data: Partial<OrderDraft>) =>
    command({
      action: "order",
      attemptId: b.state().lesson!.id,
      symbol: b.state().lesson!.recommendedAsset,
      side: "buy",
      quantity: b.state().lesson!.defaultQuantity,
      ...data,
    });
  for (const lesson of LESSONS) {
    const variants = b
      .state()
      .course.lessons.find((l) => l.id === lesson.id)!.variants;
    for (const variant of variants) {
      const before = b.currentMarks();
      command({ action: "start", variantId: variant.id });
      let a = b.state().lesson!;
      assert.equal(a.practice, false);
      assert.deepEqual(
        a.quotes.map((q) => q.price),
        e.state().prices.map((q) => q.price),
      );
      // Every fresh real lesson starts at the wallet's current marks, including when switching assets.
      assert.deepEqual(
        b.currentMarks(),
        before,
        variant.id + " must not reset a retained asset price",
      );
      const symbol = a.recommendedAsset,
        quantity = a.defaultQuantity,
        perp = { product: "perpetual" as const, symbol, quantity, leverage: 1 };
      if (lesson.id === "market") {
        order({});
        order({ side: "sell" });
      } else if (lesson.id === "perp-direction") {
        order(perp);
        order({
          ...perp,
          symbol: symbol === "ETC" ? "SOL" : "ETC",
          quantity: "0.1",
          side: "sell",
        });
      } else if (lesson.id === "perp-collateral" || lesson.id === "perp-size") {
        order(perp);
        order({ ...perp, side: "sell", reduceOnly: true });
        order(b.state().lesson!.comparison!.nextOrder!);
      } else if (lesson.id === "perp-liquidation")
        order({ ...perp, leverage: 5 });
      else if (lesson.id === "combined") {
        order({ ...perp, leverage: 2 });
        const rejected = b.state().lesson!.sharedFundsExample!;
        assert.ok(rejected);
        assert.throws(
          () => order({ ...rejected, product: "spot" }),
          (error) =>
            error instanceof DemoError &&
            error.code === "INSUFFICIENT_AVAILABLE_FUNDS",
        );
        order({ symbol, quantity });
      } else {
        const d = a.form.defaults.find(
            (d) => d.symbol === symbol && d.side === "buy",
          )!,
          product = lesson.id.startsWith("perp-") ? perp : {};
        if (lesson.id === "ioc-fok" || lesson.id === "perp-ioc-fok")
          for (const timeInForce of ["IOC", "FOK"] as const)
            order({
              ...product,
              orderType: "LIMIT",
              timeInForce,
              limitPrice: a.quotes.find((q) => q.symbol === symbol)!.price,
            });
        else
          order({
            ...product,
            orderType:
              lesson.id === "gtc" || lesson.id === "perp-gtc"
                ? "LIMIT"
                : "STOP_LIMIT",
            timeInForce: "GTC",
            limitPrice: d.limitPrice,
            ...(lesson.id === "stop-limit" || lesson.id === "perp-stop"
              ? { stopPrice: d.stopPrice }
              : {}),
          });
      }
      b.advance(a.id, 180);
      e.synchronize();
      a = b.state().lesson!;
      assert.equal(a.assessment, "passed", variant.id);
      assert.equal(a.result!.practice, false);
      const frozen = b.report(a.id);
      assert.equal(frozen.result.passed, true);
      assert.equal(
        b.state().course.totalCompletedScenarios,
        b.state().reports.filter((r) => !r.practice && r.passed).length,
      );
      assert.deepEqual(frozen, b.report(a.id));
    }
  }
  assert.equal(b.state().course.totalCompletedScenarios, 36);
  assert.equal(b.state().course.allComplete, true);
  assert.deepEqual(
    b.state().generators.map((g) => g.asset),
    ["ETC", "BTC"],
  );
  assert.equal(e.state().learningLevel, 2);
  assert.equal(e.state().converter.available, true);
  const realWallet = structuredClone(b.accountWallet()),
    realMarks = b.currentMarks();
  command({ action: "start", variantId: "market-etc" });
  assert.equal(b.state().lesson!.practice, true);
  order({ symbol: "ETC", quantity: "1" });
  b.advance(b.state().lesson!.id, 180);
  e.synchronize();
  assert.deepEqual(b.accountWallet(), realWallet);
  assert.deepEqual(b.currentMarks(), realMarks);
  assert.equal(b.state().course.totalCompletedScenarios, 36);
});
