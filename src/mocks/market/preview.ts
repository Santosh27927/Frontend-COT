import { incomingRoom } from "./capacity.ts";
import {
  quantity as parseQuantity,
  qty,
  price as parsePrice,
  product,
  quantityForCash,
} from "./exact.ts";
import { alignQuantity, quantityStep, priceStep } from "../policy/catalog.ts";
import type {
  FundsDetails,
  OrderDraft,
  OrderPreview,
} from "../../api/market-types.ts";
import { DemoError } from "../errors.ts";
import { cash, checked, decimal, format, MAX } from "./exact.ts";
import {
  available,
  quote,
  checkAuthoring,
  pending,
  copy,
  submit,
} from "./execution.ts";
import type { Execution } from "./execution.ts";
import { SYMBOLS } from "./scenarios.ts";
import type { Scenario } from "./scenarios.ts";
import { direction, marginUsed, positionAvailable, ceil } from "./perpetual.ts";
type Rejection = { code: string; status: number } | null;
export function assessOrder(
  e: Execution,
  s: Scenario,
  d: OrderDraft,
  at: number,
): { preview: OrderPreview; rejection: Rejection } {
  if (d.product === "perpetual") return assessPerpetual(e, s, d, at);
  const av = available(e),
    p: OrderPreview = {
      pendingOrder: copy(
        e.orders.find((o) => pending(o) && o.view.symbol === d.symbol)?.view ??
          null,
      ),
      blockedByPendingOrder: false,
      attemptId: d.attemptId,
      symbol: d.symbol,
      side: d.side,
      availableCash: cash(av.cash),
      reservedCash: cash(av.reservedCash),
      availableAsset: qty(av.assets[d.symbol]),
      maxQuantity: null,
      referencePrice: null,
      estimatedCost: null,
      valid: false,
      reason: null,
    };
  let rejection: Rejection = { code: "INVALID_COMMAND", status: 400 };
  try {
    const currentPrice = quote(s, d.symbol, at, e.guides),
      type = d.orderType ?? "MARKET",
      price =
        type === "MARKET" ? currentPrice : parsePrice(d.limitPrice, d.symbol);
    p.referencePrice = format(price);
    const immediate =
        type === "MARKET" ||
        (type === "LIMIT" &&
          (d.side === "buy" ? currentPrice <= price : currentPrice >= price)),
      guided = !immediate && d.timeInForce === "GTC";
    const financialMax =
      d.side === "buy"
        ? quantityForCash(av.cash, price, d.symbol)
        : av.assets[d.symbol];
    let maximum = financialMax;
    const storageMax =
      d.side === "buy" ? incomingRoom(e, d.symbol) : financialMax;
    if (storageMax < maximum) maximum = storageMax;
    const cap = (limit: bigint) => {
      if (limit < maximum) maximum = limit;
    };
    cap(MAX);
    cap(quantityForCash(MAX, price, d.symbol)); // Accepted order notional itself must be representable, even if canceled.
    if (d.side === "buy" && immediate) cap(MAX - e.wallet.quantities[d.symbol]);
    if (d.side === "sell" && immediate)
      cap(quantityForCash(MAX - e.wallet.cash, currentPrice, d.symbol));
    const highs = Object.fromEntries(
      SYMBOLS.map((a) => [
        a,
        s.frames[a].reduce((v, p) => (p > v ? p : v), 0n),
      ]),
    ) as Record<typeof d.symbol, bigint>;
    for (const g of e.guides)
      for (const n of [g.initial, g.mid, g.fill])
        if (n > highs[g.symbol]) highs[g.symbol] = n;
    // Only a pending guided order can author a new market price. An IOC/FOK limit is not a future quote.
    if (guided && price > highs[d.symbol]) highs[d.symbol] = price;
    if (type === "STOP_LIMIT") {
      const stop = parsePrice(d.stopPrice, d.symbol),
        tick = priceStep(d.symbol),
        trigger =
          d.side === "buy"
            ? stop > price + tick
              ? stop
              : price + tick
            : stop < price - tick
              ? stop
              : price - tick;
      checked(trigger);
      if (trigger <= 0n)
        throw Error(
          "This stop/limit needs a positive price tick for separate activation.",
        );
      if (trigger > highs[d.symbol]) highs[d.symbol] = trigger;
    }
    let marked = e.wallet.cash;
    for (const a of SYMBOLS)
      marked += product(e.wallet.quantities[a], highs[a]);
    for (const o of e.orders)
      if (
        (o.view.status === "PENDING" || o.view.status === "TRIGGERED") &&
        o.view.side === "buy" &&
        o.view.product !== "perpetual"
      )
        marked += product(o.q, highs[o.view.symbol]);
    if (immediate || guided) {
      if (marked > MAX) maximum = 0n;
      else if (d.side === "buy") {
        const extra = guided ? highs[d.symbol] : highs[d.symbol] - currentPrice;
        if (extra > 0n) cap(quantityForCash(MAX - marked, extra, d.symbol));
      }
    }
    if (e.positions || e.orders.some((o) => o.view.product === "perpetual")) {
      let low = 0n,
        high = (maximum < 0n ? 0n : maximum) / quantityStep(d.symbol);
      while (low < high) {
        const mid = (low + high + 1n) / 2n;
        try {
          submit(
            copy(e),
            s,
            { ...d, quantity: qty(mid * quantityStep(d.symbol)) },
            at,
            true,
          );
          low = mid;
        } catch (error) {
          if (!(error instanceof DemoError)) throw error;
          high = mid - 1n;
        }
      }
      maximum = low * quantityStep(d.symbol);
    }
    p.maxQuantity = qty(alignQuantity(maximum < 0n ? 0n : maximum, d.symbol));
    const q = parseQuantity(d.quantity, d.symbol);
    p.estimatedCost = cash(product(q, price));
    if (q > maximum) {
      const funds = q > financialMax;
      p.reason = funds
        ? d.side === "buy"
          ? "Not enough Demo USD for this order."
          : "Not enough owned asset for this sale. Spot trading cannot open a short."
        : q > storageMax
          ? `${d.symbol} destination storage has insufficient room.`
          : "This order exceeds the supported exact numeric range for scripted prices.";
      rejection = {
        code: funds
          ? "INSUFFICIENT_AVAILABLE_FUNDS"
          : q > storageMax
            ? "DESTINATION_STORAGE_FULL"
            : "INVALID_COMMAND",
        status: funds ? 409 : 400,
      };
      return { preview: p, rejection };
    }
    checkAuthoring(e, s, d, at);
    p.valid = true;
    rejection = null;
  } catch (error) {
    p.reason =
      error instanceof Error
        ? error.message
        : "Enter a valid order quantity and price.";
    if (error instanceof DemoError) {
      rejection = { code: error.code, status: error.status };
      p.blockedByPendingOrder = error.code === "ACTIVE_ORDER_EXISTS";
    }
  }
  return { preview: p, rejection };
}
function assessPerpetual(
  e: Execution,
  s: Scenario,
  d: OrderDraft,
  at: number,
): { preview: OrderPreview; rejection: Rejection } {
  const av = available(e),
    p: OrderPreview = {
      product: "perpetual",
      committedMargin: cash(marginUsed(e)),
      pendingOrder: copy(
        e.orders.find((o) => pending(o) && o.view.symbol === d.symbol)?.view ??
          null,
      ),
      blockedByPendingOrder: false,
      attemptId: d.attemptId,
      symbol: d.symbol,
      side: d.side,
      availableCash: cash(av.cash),
      reservedCash: cash(av.reservedCash),
      availableAsset: qty(positionAvailable(e, d.symbol)),
      maxQuantity: null,
      referencePrice: null,
      estimatedCost: null,
      valid: false,
      reason: null,
    };
  try {
    const leverage = direction(e, d),
      current = quote(s, d.symbol, at, e.guides),
      limit =
        d.orderType === "MARKET" || !d.orderType
          ? null
          : parsePrice(d.limitPrice, d.symbol),
      immediate =
        limit === null ||
        (d.orderType === "LIMIT" &&
          (d.side === "buy" ? current <= limit : current >= limit)),
      price = immediate ? current : limit!;
    p.referencePrice = format(price);
    const financial = d.reduceOnly
      ? positionAvailable(e, d.symbol)
      : quantityForCash(av.cash * BigInt(leverage), price, d.symbol);
    let low = 0n,
      high = (financial < MAX ? financial : MAX) / quantityStep(d.symbol);
    const fits = (q: bigint) => {
      try {
        submit(copy(e), s, { ...d, quantity: qty(q) }, at, true);
        return true;
      } catch (error) {
        if (!(error instanceof DemoError)) throw error;
        return false;
      }
    };
    // Bounded integer search uses the SAME candidate transition/safety checks as
    // submit. Every probe is isolated; no draft order reaches the real attempt.
    while (low < high) {
      const mid = (low + high + 1n) / 2n;
      if (fits(mid * quantityStep(d.symbol))) low = mid;
      else high = mid - 1n;
    }
    p.maxQuantity = qty(low * quantityStep(d.symbol));
    const q = parseQuantity(d.quantity, d.symbol),
      n = product(q, price),
      margin = d.reduceOnly ? 0n : ceil(n, BigInt(leverage));
    p.notional = cash(n);
    p.marginRequired = cash(margin);
    p.estimatedCost = cash(margin);
    if (q > financial)
      throw new DemoError(
        "INSUFFICIENT_AVAILABLE_FUNDS",
        d.reduceOnly
          ? "Not enough unreserved contracts to close this quantity."
          : "Not enough available Demo USD for isolated margin.",
        409,
      );
    if (q > low * quantityStep(d.symbol)) submit(copy(e), s, d, at, true); // Retain precise authored/range error.
    checkAuthoring(e, s, d, at);
    p.valid = true;
    return { preview: p, rejection: null };
  } catch (error) {
    p.reason =
      error instanceof Error ? error.message : "Enter a valid contract order.";
    const code = error instanceof DemoError ? error.code : "INVALID_COMMAND";
    p.blockedByPendingOrder = code === "ACTIVE_ORDER_EXISTS";
    return {
      preview: p,
      rejection: {
        code,
        status: error instanceof DemoError ? error.status : 400,
      },
    };
  }
}
export function previewOrder(
  e: Execution,
  s: Scenario,
  d: OrderDraft,
  at: number,
): OrderPreview {
  return assessOrder(e, s, d, at).preview;
}
export function fundsDetails(p: OrderPreview, d: OrderDraft): FundsDetails {
  return {
    symbol: p.symbol,
    side: p.side,
    availableCash: p.availableCash,
    availableAsset: p.availableAsset,
    maxQuantity: p.maxQuantity ?? "0",
    referencePrice: p.referencePrice ?? "0",
    requiredCash: p.estimatedCost ?? "0.00",
    requestedQuantity: d.quantity,
  };
}
