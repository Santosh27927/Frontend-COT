import { timing } from "./scenarios.ts";
import type {
  Comparison,
  ComparisonFill,
  LessonId,
  Order,
} from "../../api/market-types.ts";
import type { Execution, InternalOrder } from "./execution.ts";
import { quote } from "./execution.ts";
import type { Scenario } from "./scenarios.ts";
import { goalDefinitions, groupOf, topicOf } from "./course.ts";
import {
  cash,
  decimal,
  format,
  product,
  quantity as parseQuantity,
  qty,
  quantityForCash,
} from "./exact.ts";
import { ceil } from "./perpetual.ts";

const opening = (o: InternalOrder) =>
  o.view.status === "FILLED" &&
  o.view.product === "perpetual" &&
  !o.view.reduceOnly;
function comparisonFill(o: Order): ComparisonFill {
  const n = product(parseQuantity(o.quantity, o.symbol), decimal(o.price)),
    m = ceil(n, BigInt(o.leverage!));
  return {
    orderId: o.id,
    symbol: o.symbol,
    side: o.side,
    quantity: o.quantity,
    price: o.price,
    margin: cash(m),
    notional: cash(n),
    leverage: o.leverage!,
    illustrativeGain: cash(n / 10n),
    illustrativeLoss: cash(-n / 10n),
  };
}
export function comparison(
  e: Execution,
  s: Scenario,
  at: number,
): Comparison | undefined {
  if (s.lessonId !== "perp-collateral" && s.lessonId !== "perp-size") return;
  const baseline = e.orders.find((o) => opening(o) && o.view.leverage === 1),
    policy = s.lessonId === "perp-size" ? "same-size" : "same-collateral";
  const closed =
    baseline &&
    e.positionCloses?.find(
      (c) =>
        c.positionId === baseline.view.positionId &&
        c.full &&
        c.reason === "user",
    );
  const target = (price: bigint) =>
    !baseline
      ? null
      : policy === "same-size"
        ? baseline.q
        : quantityForCash(
            2n * product(baseline.q, decimal(baseline.view.price)),
            price,
            baseline.view.symbol,
          );
  const paired =
    baseline &&
    closed &&
    e.orders.find(
      (o, i) =>
        i > e.orders.findIndex((c) => c.view.id === closed.orderId) &&
        opening(o) &&
        o.view.leverage === 2 &&
        o.view.positionId !== baseline.view.positionId &&
        o.at >= closed.second * 1000 &&
        o.view.symbol === baseline.view.symbol &&
        o.view.side === baseline.view.side &&
        o.q === target(decimal(o.view.price)),
    );
  const quantity = baseline
    ? target(quote(s, baseline.view.symbol, at, e.guides))
    : null;
  return {
    policy,
    baseline: baseline ? comparisonFill(baseline.view) : null,
    baselineClosed: !!closed,
    paired: paired ? comparisonFill(paired.view) : null,
    targetQuantity: quantity === null ? null : qty(quantity),
    nextOrder:
      baseline && closed && !paired && quantity !== null && quantity > 0n
        ? {
            symbol: baseline.view.symbol,
            side: baseline.view.side,
            quantity: qty(quantity),
            product: "perpetual",
            leverage: 2,
            reduceOnly: false,
            orderType: "MARKET",
            timeInForce: "IOC",
          }
        : null,
    collateralDifference:
      policy === "same-collateral" && paired && baseline
        ? cash(
            ceil(product(paired.q, decimal(paired.view.price)), 2n) -
              product(baseline.q, decimal(baseline.view.price)),
          )
        : null,
    message: !baseline
      ? "Open a 1x baseline on your chosen asset."
      : !closed
        ? "Fully close this baseline position explicitly, then open 2x on the same asset and direction."
        : paired
          ? policy === "same-size"
            ? "Both actual fills match. With the same contract quantity, the same absolute price move produces the same PnL at 1x and 2x. Leverage changes collateral and risk. These 10% illustrations use each actual entry price; when entry prices differ, their absolute moves and amounts can differ."
            : "Both actual fills match the controlled comparison. The 10% illustration is hypothetical, not your realized return."
          : "Use the current target quantity for2x on the baseline asset and direction. Quantity precision can leave a small collateral rounding difference.",
  };
}
type Hit = { at: number; filledAt: number } | null;
export function evidence(e: Execution, s: Scenario) {
  const id: LessonId = s.lessonId ?? "market",
    defs = goalDefinitions(id),
    topic = topicOf(id);
  const hit = (o: InternalOrder | undefined): Hit =>
    o ? { at: o.at, filledAt: (o.view.filledAt ?? 0) * 1000 } : null;
  let hits: Hit[];
  if (id === "perp-direction")
    hits = ["buy", "sell"].map((side) =>
      hit(
        e.orders.find(
          (o) => opening(o) && o.view.leverage === 1 && o.view.side === side,
        ),
      ),
    );
  else if (id === "perp-collateral" || id === "perp-size") {
    const c = comparison(e, s, 0)!,
      b = e.orders.find((o) => o.view.id === c.baseline?.orderId),
      p = e.orders.find((o) => o.view.id === c.paired?.orderId),
      closed =
        b &&
        e.positionCloses?.find(
          (c) =>
            c.positionId === b.view.positionId && c.full && c.reason === "user",
        );
    hits = [
      hit(b),
      closed
        ? { at: closed.second * 1000, filledAt: closed.second * 1000 }
        : null,
      hit(p),
    ];
  } else if (id === "perp-liquidation") {
    const l = e.liquidations?.find((l) =>
      e.orders.some(
        (o) =>
          opening(o) &&
          o.view.leverage === 5 &&
          o.view.positionId === l.positionId,
      ),
    );
    const o =
      l &&
      e.orders.find(
        (o) =>
          opening(o) &&
          o.view.leverage === 5 &&
          o.view.positionId === l.positionId,
      );
    hits = [l && o ? { at: o.at, filledAt: l.second * 1000 } : null];
  } else if (id === "combined") {
    const rejected = e.marginRejection;
    hits = [
      hit(e.orders.find(opening)),
      rejected
        ? { at: rejected.second * 1000, filledAt: rejected.second * 1000 }
        : null,
      hit(
        rejected
          ? e.orders.find(
              (o, i) =>
                i >= (e.rejectionOrderCount ?? Infinity) &&
                o.view.status === "FILLED" &&
                o.view.product !== "perpetual" &&
                o.view.side === "buy",
            )
          : undefined,
      ),
    ];
  } else
    hits = defs.map((g) =>
      hit(
        e.orders.find(
          (o) =>
            o.view.status === "FILLED" &&
            (groupOf(id) === "perpetual"
              ? o.view.product === "perpetual"
              : o.view.product !== "perpetual") &&
            (topic === "market" ||
              (topic === "gtc" &&
                o.view.orderType === "LIMIT" &&
                o.view.timeInForce === "GTC" &&
                o.waited) ||
              (topic === "ioc-fok" &&
                o.view.orderType === "LIMIT" &&
                o.view.timeInForce === g.id.toUpperCase()) ||
              (topic === "stop-limit" &&
                o.view.orderType === "STOP_LIMIT" &&
                o.view.triggeredAt !== null &&
                o.view.filledAt! > o.view.triggeredAt)),
        ),
      ),
    );
  const complete = hits.every(Boolean),
    accepted = hits.filter((h): h is NonNullable<Hit> => !!h);
  return {
    goals: defs.map((g, i) => ({ ...g, done: !!hits[i] })),
    complete,
    lastAccepted: accepted.length
      ? Math.max(...accepted.map((h) => h.at))
      : null,
    readyAt: complete
      ? Math.max(
          ...accepted.map((h) =>
            Math.max(
              h.at + timing(s).fill + timing(s).review,
              h.filledAt + timing(s).review,
            ),
          ),
        )
      : null,
  };
}
