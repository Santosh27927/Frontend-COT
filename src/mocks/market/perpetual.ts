import { cashCredit } from "./capacity.ts";
import { randomUUID } from "node:crypto";
import type {
  OrderDraft,
  PositionView,
  PositionClose,
  Symbol,
} from "../../api/market-types.ts";
import type { Execution, InternalOrder } from "./execution.ts";
import { DemoError } from "../errors.ts";
import {
  cash,
  checked,
  decimal,
  format,
  product,
  qty,
  priceForNotional,
} from "./exact.ts";

export type Position = {
  id: string;
  symbol: Symbol;
  side: "buy" | "sell";
  leverage: number;
  q: bigint;
  basis: bigint;
  margin: bigint;
};
export const ceil = (n: bigint, d: bigint) => n / d + (n % d ? 1n : 0n);
export const marginUsed = (e: Pick<Execution, "positions">) =>
  Object.values(e.positions ?? {}).reduce((v, p) => checked(v + p!.margin), 0n);
export const cashAvailable = (
  e: Pick<Execution, "wallet" | "positions" | "orders">,
  exclude?: string,
) =>
  e.wallet.cash -
  marginUsed(e) -
  e.orders.reduce(
    (v, o) => v + (o.view.id === exclude ? 0n : o.reservedCash),
    0n,
  );
export const positionAvailable = (
  e: Execution,
  symbol: Symbol,
  exclude?: string,
) =>
  (e.positions?.[symbol]?.q ?? 0n) -
  e.orders.reduce(
    (v, o) =>
      v +
      (o.view.symbol === symbol && o.view.id !== exclude
        ? (o.reservedPosition ?? 0n)
        : 0n),
    0n,
  );
const reject = (message: string, funds = false): never => {
  throw new DemoError(
    funds ? "INSUFFICIENT_AVAILABLE_FUNDS" : "INVALID_COMMAND",
    message,
    funds ? 409 : 400,
  );
};
export function direction(e: Execution, d: OrderDraft): number {
  const p = e.positions?.[d.symbol];
  if (d.reduceOnly) {
    if (!p || p.side === d.side)
      reject(
        "Choose the opposite direction and an existing position to reduce.",
      );
    if (d.leverage !== undefined && d.leverage !== p!.leverage)
      reject("A close must use the position's existing leverage.");
    return p!.leverage;
  }
  const leverage = d.leverage ?? 1;
  if (
    ![1, 2, 5].includes(leverage) ||
    (p && (p.side !== d.side || p.leverage !== leverage))
  )
    reject(
      "Close the existing position before changing its direction or leverage.",
    );
  return leverage;
}
export function preparePerpetual(
  e: Execution,
  d: OrderDraft,
  q: bigint,
  price: bigint,
  exclude?: string,
) {
  const leverage = direction(e, d),
    notional = product(q, price),
    margin = d.reduceOnly ? 0n : ceil(notional, BigInt(leverage));
  if (
    d.reduceOnly
      ? q > positionAvailable(e, d.symbol, exclude)
      : margin > cashAvailable(e, exclude)
  )
    reject(
      d.reduceOnly
        ? "Not enough unreserved contracts to close this quantity."
        : "Not enough available Demo USD for isolated margin.",
      true,
    );
  return { leverage, notional, margin };
}
export function fillPerpetual(
  e: Execution,
  o: InternalOrder,
  price: bigint,
  at: number,
  reason: PositionClose["reason"] = "user",
) {
  const d: OrderDraft = {
    attemptId: "",
    symbol: o.view.symbol,
    side: o.view.side,
    quantity: o.view.quantity,
    product: "perpetual",
    leverage: o.view.leverage,
    reduceOnly: o.view.reduceOnly,
  };
  const terms = preparePerpetual(e, d, o.q, price, o.view.id),
    positions = (e.positions ??= {}),
    p = positions[d.symbol];
  if (d.reduceOnly) {
    const basis = (p!.basis * o.q) / p!.q,
      released = (p!.margin * o.q) / p!.q;
    const raw =
      p!.side === "buy" ? terms.notional - basis : basis - terms.notional;
    const pnl = reason === "liquidation" && raw < -released ? -released : raw;
    cashCredit(e, pnl);
    if (e.wallet.cash < 0n) throw Error("Isolated cash invariant failed");
    const closed: PositionClose = {
      orderId: o.view.id,
      positionId: p!.id,
      symbol: d.symbol,
      side: p!.side,
      quantity: qty(o.q),
      price: format(price),
      entryNotional: cash(basis),
      marginReleased: cash(released),
      realizedPnl: cash(pnl),
      rawPnl: cash(raw),
      trainingBackstop: cash(pnl - raw),
      second: at / 1000,
      reason,
      full: o.q === p!.q,
    };
    (e.positionCloses ??= []).push(closed);
    o.view.positionId = p!.id;
    o.view.margin = cash(released);
    o.view.realizedPnl = cash(pnl);
    p!.q -= o.q;
    p!.basis -= basis;
    p!.margin -= released;
    if (!p!.q) delete positions[d.symbol];
    return closed;
  }
  const position: Position = {
    id: p?.id ?? randomUUID(),
    symbol: d.symbol,
    side: d.side,
    leverage: terms.leverage,
    q: checked((p?.q ?? 0n) + o.q),
    basis: checked((p?.basis ?? 0n) + terms.notional),
    margin: checked((p?.margin ?? 0n) + terms.margin),
  };
  positions[d.symbol] = position;
  o.view.positionId = position.id;
  o.view.margin = cash(terms.margin);
  o.view.realizedPnl = "0.00";
  return null;
}
export function positionViews(
  e: Execution,
  prices: Record<Symbol, bigint>,
): PositionView[] {
  return Object.values(e.positions ?? {}).map((p) => {
    const current = product(p!.q, prices[p!.symbol]),
      pnl = p!.side === "buy" ? current - p!.basis : p!.basis - current;
    const available = positionAvailable(e, p!.symbol);
    return {
      id: p!.id,
      symbol: p!.symbol,
      side: p!.side,
      leverage: p!.leverage,
      quantity: qty(p!.q),
      entryNotional: cash(p!.basis),
      entryPrice: format(priceForNotional(p!.basis, p!.q)),
      margin: cash(p!.margin),
      currentNotional: cash(current),
      unrealizedPnl: cash(pnl),
      equity: cash(checked(p!.margin + pnl)),
      maintenance: cash(ceil(current, 100n)),
      availableQuantity: qty(available),
      closeOrder:
        available > 0n
          ? {
              symbol: p!.symbol,
              side: p!.side === "buy" ? "sell" : "buy",
              quantity: qty(available),
              product: "perpetual",
              reduceOnly: true,
              orderType: "MARKET",
              timeInForce: "IOC",
            }
          : null,
    };
  });
}
export function unrealized(
  e: Pick<Execution, "positions">,
  prices: Record<Symbol, bigint>,
): bigint {
  return Object.values(e.positions ?? {}).reduce(
    (v, p) =>
      checked(
        v +
          (p!.side === "buy"
            ? product(p!.q, prices[p!.symbol]) - p!.basis
            : p!.basis - product(p!.q, prices[p!.symbol])),
      ),
    0n,
  );
}
export function breach(e: Execution, symbol: Symbol, price: bigint) {
  const p = e.positions?.[symbol];
  if (!p) return null;
  const n = product(p.q, price),
    pnl = p.side === "buy" ? n - p.basis : p.basis - n,
    equity = checked(p.margin + pnl),
    maintenance = ceil(n, 100n);
  return equity <= maintenance
    ? { equity: cash(equity), maintenance: cash(maintenance) }
    : null;
}
