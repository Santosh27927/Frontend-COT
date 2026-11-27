import { cashCredit, incomingRoom } from "./capacity.ts";
import { randomUUID } from "node:crypto";
import type {
  CoreCommand,
  Event,
  Lesson,
  Order,
  OrderDraft,
  OrderType,
  TimeInForce,
  Symbol,
  WalletView,
  Liquidation,
  PositionClose,
  MarginRejection,
} from "../../api/market-types.ts";
import { DemoError } from "../errors.ts";
import {
  cash,
  checked,
  decimal,
  format,
  invalid,
  product,
  quantity as parseQuantity,
  qty,
  price as parsePrice,
  MAX,
} from "./exact.ts";
import { alignPrice, priceStep } from "../policy/catalog.ts";
import { SYMBOLS, timing } from "./scenarios.ts";
import type { Scenario } from "./scenarios.ts";
import {
  marginUsed,
  preparePerpetual,
  fillPerpetual,
  breach,
  unrealized,
} from "./perpetual.ts";
import type { Position } from "./perpetual.ts";
export type Wallet = { cash: bigint; quantities: Record<Symbol, bigint> };
export type Guide = {
  symbol: Symbol;
  at: number;
  initial: bigint;
  mid: bigint;
  fill: bigint;
  until: number;
  canceledAt?: number;
};
export type InternalOrder = {
  system?: boolean;
  view: Order;
  at: number;
  q: bigint;
  limit: bigint | null;
  stop: bigint | null;
  reservedCash: bigint;
  reservedAsset: bigint;
  guide: Guide | null;
  waited: boolean;
  reservedPosition?: bigint;
};
export type Execution = {
  wallet: Wallet;
  bought: Record<Symbol, bigint>;
  orders: InternalOrder[];
  guides: Guide[];
  events: Event[];
  positions?: Partial<Record<Symbol, Position>>;
  positionCloses?: PositionClose[];
  liquidations?: Liquidation[];
  reconciledAt?: number;
  marginRejection?: MarginRejection;
  rejectionOrderCount?: number;
  overflowCash?: bigint;
};
export const empty = (): Record<Symbol, bigint> => ({
  ETC: 0n,
  SOL: 0n,
  BTC: 0n,
});
export const copy = <T>(value: T): T => structuredClone(value);
export const pending = (o: InternalOrder) =>
  o.view.status === "PENDING" || o.view.status === "TRIGGERED";
export function fail(code: string, message: string, status = 409): never {
  throw new DemoError(code, message, status);
}
const attemptId = (v: unknown) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export function parseDraft(input: unknown, preview = false): OrderDraft {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("Send an order draft.");
  const b = input as Record<string, unknown>;
  if (
    Object.keys(b).some(
      (k) =>
        ![
          "attemptId",
          "symbol",
          "side",
          "quantity",
          "orderType",
          "timeInForce",
          "limitPrice",
          "stopPrice",
          "product",
          "leverage",
          "reduceOnly",
        ].includes(k),
    )
  )
    invalid("Unexpected order fields.");
  if (
    !attemptId(b.attemptId) ||
    !SYMBOLS.includes(b.symbol as Symbol) ||
    !["buy", "sell"].includes(b.side as string)
  )
    invalid("Choose a valid attempt, asset and direction.");
  const quantity = preview && b.quantity === undefined ? "" : b.quantity;
  if (typeof quantity !== "string" || quantity.length > 25) invalid();
  if (!preview) parseQuantity(quantity, b.symbol as Symbol);
  const type = (b.orderType ?? "MARKET") as OrderType,
    tif = (b.timeInForce ?? (type === "MARKET" ? "IOC" : "GTC")) as TimeInForce;
  if (
    !["MARKET", "LIMIT", "STOP_LIMIT"].includes(type) ||
    !["IOC", "GTC", "FOK"].includes(tif) ||
    (type === "MARKET" && tif !== "IOC") ||
    (type === "STOP_LIMIT" && tif !== "GTC")
  )
    invalid("Unsupported order type or time-in-force.");
  if (
    (type === "MARKET" &&
      (b.limitPrice !== undefined || b.stopPrice !== undefined)) ||
    (type !== "STOP_LIMIT" && b.stopPrice !== undefined)
  )
    invalid("Unexpected price fields for this order type.");
  if (
    type !== "MARKET" &&
    (typeof b.limitPrice !== "string" || b.limitPrice.length > 25)
  )
    invalid("Enter a limit price.");
  if (
    type === "STOP_LIMIT" &&
    (typeof b.stopPrice !== "string" || b.stopPrice.length > 25)
  )
    invalid("Enter a stop price.");
  if (!preview && type !== "MARKET")
    parsePrice(b.limitPrice, b.symbol as Symbol);
  if (!preview && type === "STOP_LIMIT")
    parsePrice(b.stopPrice, b.symbol as Symbol);
  const product = b.product ?? "spot";
  if (
    !["spot", "perpetual"].includes(product as string) ||
    (product === "spot" &&
      (b.leverage !== undefined || b.reduceOnly !== undefined)) ||
    (b.reduceOnly !== undefined && typeof b.reduceOnly !== "boolean") ||
    (b.leverage !== undefined &&
      (typeof b.leverage !== "number" || ![1, 2, 5].includes(b.leverage)))
  )
    invalid("Choose a supported product, leverage and close mode.");
  return {
    ...(product === "perpetual"
      ? {
          product: "perpetual" as const,
          reduceOnly: b.reduceOnly === true,
          ...(b.reduceOnly !== true || b.leverage !== undefined
            ? { leverage: (b.leverage ?? 1) as number }
            : {}),
        }
      : {}),
    attemptId: b.attemptId as string,
    symbol: b.symbol as Symbol,
    side: b.side as "buy" | "sell",
    quantity,
    orderType: type,
    timeInForce: tif,
    ...(b.limitPrice !== undefined
      ? { limitPrice: b.limitPrice as string }
      : {}),
    ...(b.stopPrice !== undefined ? { stopPrice: b.stopPrice as string } : {}),
  };
}
export function parseCommand(input: unknown): CoreCommand {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("Send a command object.");
  const b = input as Record<string, unknown>;
  if (
    typeof b.intentId !== "string" ||
    !/^[A-Za-z0-9._:-]{8,128}$/.test(b.intentId)
  )
    invalid("A stable intent key of 8–128 characters is required.");
  const fields =
    b.action === "start"
      ? ["action", "intentId", "variantId"]
      : b.action === "order"
        ? [
            "action",
            "intentId",
            "attemptId",
            "symbol",
            "side",
            "quantity",
            "orderType",
            "timeInForce",
            "limitPrice",
            "stopPrice",
            "product",
            "leverage",
            "reduceOnly",
          ]
        : b.action === "cancel"
          ? ["action", "intentId", "attemptId", "orderId"]
          : b.action === "collect"
            ? ["action", "intentId", "asset"]
            : b.action === "finish"
              ? ["action", "intentId", "attemptId"]
              : invalid("Unsupported command.");
  if (Object.keys(b).some((k) => !fields.includes(k)))
    invalid("Unexpected command fields.");
  if (b.action === "start") {
    if (b.variantId !== undefined && typeof b.variantId !== "string")
      invalid("Choose a scenario.");
    return {
      action: "start",
      intentId: b.intentId,
      ...(b.variantId !== undefined
        ? { variantId: b.variantId as string }
        : {}),
    };
  }
  if (b.action === "collect") {
    if (!SYMBOLS.includes(b.asset as Symbol)) invalid("Choose a generator.");
    return {
      action: "collect",
      intentId: b.intentId,
      asset: b.asset as Symbol,
    };
  }
  if (!attemptId(b.attemptId)) invalid("Choose a valid attempt.");
  if (b.action === "cancel") {
    if (!attemptId(b.orderId)) invalid("Choose a valid order.");
    return {
      action: "cancel",
      intentId: b.intentId,
      attemptId: b.attemptId as string,
      orderId: b.orderId as string,
    };
  }
  if (b.action === "finish")
    return {
      action: "finish",
      intentId: b.intentId,
      attemptId: b.attemptId as string,
    };
  const { action: _, intentId: __, ...draft } = b;
  return { action: "order", intentId: b.intentId, ...parseDraft(draft) };
}
export function quote(
  s: Scenario,
  symbol: Symbol,
  at: number,
  guides: Guide[] = [],
): bigint {
  const g = guides
    .filter(
      (g) =>
        g.symbol === symbol &&
        g.at <= at &&
        (at < g.until ||
          (at === timing(s).duration &&
            g.until === timing(s).duration &&
            g.canceledAt === undefined)),
    )
    .at(-1);
  const generated = g
    ? at < g.at + timing(s).trigger
      ? g.initial
      : at < g.at + timing(s).fill
        ? g.mid
        : g.fill
    : s.frames[symbol][Math.min(6, Math.floor(at / timing(s).frame))];
  return alignPrice(generated, symbol);
}
export function value(
  wallet: Wallet,
  s: Scenario,
  at: number,
  guides: Guide[] = [],
  positions?: Execution["positions"],
): bigint {
  return checked(
    SYMBOLS.reduce(
      (sum, a) =>
        checked(sum + product(wallet.quantities[a], quote(s, a, at, guides))),
      wallet.cash,
    ) +
      unrealized(
        { positions },
        Object.fromEntries(
          SYMBOLS.map((a) => [a, quote(s, a, at, guides)]),
        ) as Record<Symbol, bigint>,
      ),
  );
}
export function available(e: Execution): {
  cash: bigint;
  reservedCash: bigint;
  assets: Record<Symbol, bigint>;
} {
  let reservedCash = 0n;
  const assets = copy(e.wallet.quantities);
  for (const o of e.orders.filter(pending)) {
    reservedCash = checked(reservedCash + o.reservedCash);
    assets[o.view.symbol] -= o.reservedAsset;
  }
  return {
    cash: e.wallet.cash - reservedCash - marginUsed(e),
    reservedCash,
    assets,
  };
}
export function walletView(
  e: Pick<Execution, "wallet" | "guides" | "orders" | "positions">,
  s: Scenario,
  at: number,
): WalletView {
  const av = available({ ...e, bought: empty(), events: [] });
  return {
    cash: cash(e.wallet.cash),
    availableCash: cash(av.cash),
    reservedCash: cash(av.reservedCash),
    ...(e.positions
      ? {
          committedMargin: cash(marginUsed(e)),
          unrealizedPnl: cash(
            unrealized(
              e,
              Object.fromEntries(
                SYMBOLS.map((a) => [a, quote(s, a, at, e.guides)]),
              ) as Record<Symbol, bigint>,
            ),
          ),
        }
      : {}),
    holdings: SYMBOLS.map((asset) => ({
      asset,
      quantity: qty(e.wallet.quantities[asset]),
      value: cash(
        product(e.wallet.quantities[asset], quote(s, asset, at, e.guides)),
      ),
    })),
    portfolioValue: cash(value(e.wallet, s, at, e.guides, e.positions)),
  };
}
export function assertSafe(e: Execution, s: Scenario): void {
  const quantities = copy(e.wallet.quantities);
  for (const o of e.orders.filter(
    (o) =>
      pending(o) && o.view.side === "buy" && o.view.product !== "perpetual",
  ))
    quantities[o.view.symbol] = checked(quantities[o.view.symbol] + o.q);
  let maximum = e.wallet.cash;
  for (const a of SYMBOLS) {
    let high = s.frames[a].reduce((v, p) => (p > v ? p : v), 0n);
    for (const g of e.guides.filter((g) => g.symbol === a))
      for (const p of [g.initial, g.mid, g.fill]) if (p > high) high = p;
    maximum = checked(maximum + product(quantities[a], high));
    let low = s.frames[a].reduce((v, p) => (p < v ? p : v), s.frames[a][0]);
    for (const g of e.guides.filter((g) => g.symbol === a))
      for (const p of [g.initial, g.mid, g.fill]) if (p < low) low = p;
    const exposures = [
      ...(e.positions?.[a] ? [e.positions[a]!] : []),
      ...e.orders
        .filter(
          (o) =>
            pending(o) &&
            o.view.product === "perpetual" &&
            !o.view.reduceOnly &&
            o.view.symbol === a,
        )
        .map((o) => ({
          q: o.q,
          basis: product(o.q, o.limit ?? decimal(o.view.price)),
          side: o.view.side,
        })),
    ];
    const totalQ = exposures.reduce((sum, p) => checked(sum + p.q), 0n);
    product(totalQ, high);
    exposures.reduce((sum, p) => checked(sum + p.basis), 0n);
    for (const p of exposures) {
      const highNotional = product(p.q, high),
        gain =
          p.side === "buy"
            ? highNotional - p.basis
            : p.basis - product(p.q, low);
      if (gain > 0n) maximum = checked(maximum + gain);
    }
  }
}
export function publicQuotes(
  s: Scenario,
  at: number,
  guides: Guide[],
): Lesson["quotes"] {
  const times = new Set<number>([0]);
  for (let i = 1; i <= 6; i++)
    if (i * timing(s).frame <= at) times.add(i * timing(s).frame);
  for (const g of guides)
    for (const t of [
      g.at,
      g.at + timing(s).trigger,
      g.at + timing(s).fill,
      g.until,
      g.canceledAt,
    ])
      if (t !== undefined && t <= at && t <= timing(s).duration) times.add(t);
  return SYMBOLS.map((symbol) => {
    const points = [...times]
      .sort((a, b) => a - b)
      .map((t) => ({ t, p: quote(s, symbol, t, guides) }));
    let low = points[0].p,
      high = low;
    for (const p of points) {
      if (p.p < low) low = p.p;
      if (p.p > high) high = p.p;
    }
    return {
      symbol,
      price: format(quote(s, symbol, at, guides)),
      history: points.map(({ t, p }) => ({
        second: t / 1000,
        price: format(p),
        x: (t * 300) / timing(s).duration,
        y: high === low ? 60 : 110 - Number(((p - low) * 100n) / (high - low)),
      })),
    };
  });
}
function eligible(side: "buy" | "sell", price: bigint, limit: bigint): boolean {
  return side === "buy" ? price <= limit : price >= limit;
}
export function fill(
  e: Execution,
  o: InternalOrder,
  price: bigint,
  at: number,
  reason: PositionClose["reason"] = "user",
): void {
  const total = product(o.q, price),
    a = o.view.symbol;
  if (o.view.product === "perpetual") {
    if (o.waited) {
      try {
        preparePerpetual(
          e,
          {
            attemptId: "",
            symbol: a,
            side: o.view.side,
            quantity: o.view.quantity,
            product: "perpetual",
            leverage: o.view.leverage,
            reduceOnly: o.view.reduceOnly,
          },
          o.q,
          price,
          o.view.id,
        );
      } catch (error) {
        if (!(error instanceof DemoError)) throw error;
        cancel(e, o, at, error.message);
        return;
      }
    }
    fillPerpetual(e, o, price, at, reason);
  } else if (o.view.side === "buy") {
    e.wallet.cash = checked(e.wallet.cash - total);
    e.wallet.quantities[a] = checked(e.wallet.quantities[a] + o.q);
    e.bought[a] = checked(e.bought[a] + o.q);
  } else {
    cashCredit(e, total);
    e.wallet.quantities[a] -= o.q;
    e.bought[a] -= o.q < e.bought[a] ? o.q : e.bought[a];
  }
  o.reservedCash = 0n;
  o.reservedAsset = 0n;
  o.reservedPosition = 0n;
  o.view.status = "FILLED";
  o.view.price = format(price);
  o.view.total = cash(total);
  o.view.filledAt = at / 1000;
  o.view.canCancel = false;
  e.events.push({
    second: at / 1000,
    message:
      o.view.product === "perpetual"
        ? `${o.view.reduceOnly ? "Reduced" : "Opened"} ${o.view.quantity} ${a} perpetual contracts at $${o.view.price} (${o.view.leverage}x). ${o.view.reduceOnly ? `Realized PnL $${o.view.realizedPnl}.` : "Notional is exposure, not spendable cash or spot ownership."}`
        : `${o.view.side === "buy" ? "Bought" : "Sold"} ${o.view.quantity} ${a} at $${o.view.price}. ${o.waited ? "Pending order filled." : "Filled immediately."}`,
  });
}
export function cancel(
  e: Execution,
  o: InternalOrder,
  at: number,
  reason: string,
): void {
  if (!pending(o))
    fail("INVALID_COMMAND", "Only a pending order can be canceled.", 400);
  o.view.status = "CANCELED";
  o.view.reason = reason;
  o.view.canCancel = false;
  o.reservedCash = 0n;
  o.reservedAsset = 0n;
  o.reservedPosition = 0n;
  if (o.guide) {
    o.guide.until = Math.min(o.guide.until, at);
    o.guide.canceledAt = at;
  }
  e.events.push({
    second: at / 1000,
    message: `${o.view.timeInForce} ${o.view.symbol} order canceled: ${reason}. Reserved funds released.`,
  });
}
export function checkAuthoring(
  e: Execution,
  s: Scenario,
  d: OrderDraft,
  at: number,
): void {
  if (e.orders.filter((o) => !o.system).length >= 256)
    invalid("This scenario supports up to256 orders.");
  const type = d.orderType ?? "MARKET",
    price = quote(s, d.symbol, at, e.guides),
    limit = type === "MARKET" ? null : parsePrice(d.limitPrice, d.symbol),
    stop = type === "STOP_LIMIT" ? parsePrice(d.stopPrice, d.symbol) : null;
  if (stop !== null && (d.side === "buy" ? price >= stop : price <= stop))
    invalid(
      "Use a dormant stop beyond the current price for this guided exercise.",
    );
  const match =
    type === "MARKET" || (type === "LIMIT" && eligible(d.side, price, limit!));
  if (
    !match &&
    d.timeInForce === "GTC" &&
    e.orders.some((o) => pending(o) && o.view.symbol === d.symbol)
  )
    fail(
      "ACTIVE_ORDER_EXISTS",
      "Your existing order for this asset is still waiting. Let it fill or cancel it before placing another waiting order.",
    );
}
export function submit(
  e: Execution,
  s: Scenario,
  d: OrderDraft,
  at: number,
  probe = false,
): InternalOrder {
  if (!probe) {
    reconcile(e, s, at);
    checkAuthoring(e, s, d, at);
  }
  const type = d.orderType ?? "MARKET",
    tif = d.timeInForce ?? "IOC",
    q = parseQuantity(d.quantity, d.symbol),
    price = quote(s, d.symbol, at, e.guides),
    limit = type === "MARKET" ? null : parsePrice(d.limitPrice, d.symbol),
    stop = type === "STOP_LIMIT" ? parsePrice(d.stopPrice, d.symbol) : null;
  const match =
    type === "MARKET" || (type === "LIMIT" && eligible(d.side, price, limit!));
  if (
    d.product !== "perpetual" &&
    d.side === "buy" &&
    q > incomingRoom(e, d.symbol)
  )
    fail(
      "DESTINATION_STORAGE_FULL",
      `${d.symbol} destination storage has insufficient room.`,
    );
  const total = product(q, match ? price : limit!),
    o: InternalOrder = {
      view: {
        id: randomUUID(),
        second: Math.floor(at / 1000),
        symbol: d.symbol,
        side: d.side,
        quantity: qty(q),
        price: format(price),
        total: cash(total),
        status: "PENDING",
        orderType: type,
        timeInForce: tif,
        limitPrice: limit === null ? null : format(limit),
        stopPrice: stop === null ? null : format(stop),
        filledAt: null,
        triggeredAt: null,
        reason: null,
        canCancel: true,
        ...(d.product === "perpetual"
          ? {
              product: d.product,
              leverage: d.leverage ?? e.positions?.[d.symbol]?.leverage ?? 1,
              reduceOnly: d.reduceOnly === true,
            }
          : {}),
      },
      at,
      q,
      limit,
      stop,
      reservedCash: d.side === "buy" ? total : 0n,
      reservedAsset: d.side === "sell" ? q : 0n,
      guide: null,
      waited: false,
    };
  if (d.product === "perpetual") {
    const terms = preparePerpetual(e, d, q, match ? price : limit!);
    o.view.leverage = terms.leverage;
    o.reservedCash = terms.margin;
    o.reservedAsset = 0n;
    o.reservedPosition = d.reduceOnly ? q : 0n;
  }
  if (!match && tif === "GTC") {
    let mid: bigint;
    const tick = priceStep(d.symbol);
    if (stop !== null) {
      mid =
        d.side === "buy"
          ? stop > limit! + tick
            ? stop
            : checked(limit! + tick)
          : stop < limit! - tick
            ? stop
            : limit! - tick;
      if (mid <= 0n)
        invalid(
          "This stop/limit has no positive price tick for a separate trigger. Increase the limit.",
        );
    } else
      mid =
        d.side === "buy"
          ? (price + limit!) / 2n > limit!
            ? (price + limit!) / 2n
            : checked(limit! + tick)
          : (price + limit! + tick) / 2n < limit!
            ? (price + limit! + tick) / 2n
            : limit! - tick;
    const guide: Guide = {
      symbol: d.symbol,
      at,
      initial: price,
      mid: checked(alignPrice(mid, d.symbol)),
      fill: limit!,
      until: Math.min(
        timing(s).duration,
        (Math.floor((at + timing(s).fill) / timing(s).frame) + 1) *
          timing(s).frame,
      ),
    };
    o.guide = guide;
    o.waited = true;
    e.guides.push(guide);
  }
  e.orders.push(o);
  if (
    s.lessonId === "perp-liquidation" &&
    d.product === "perpetual" &&
    !d.reduceOnly &&
    !e.positions?.[d.symbol] &&
    match &&
    o.view.leverage === 5
  ) {
    const mid = checked(
        d.side === "buy" ? (price * 9n) / 10n : (price * 11n + 9n) / 10n,
      ),
      end = checked(
        d.side === "buy" ? (price * 7n) / 10n : (price * 13n + 9n) / 10n,
      );
    if (end <= 0n)
      invalid("The authored liquidation path needs a positive price tick.");
    e.guides.push({
      symbol: d.symbol,
      at,
      initial: price,
      mid: alignPrice(mid, d.symbol),
      fill: alignPrice(end, d.symbol),
      until: Math.min(
        timing(s).duration,
        (Math.floor((at + timing(s).fill) / timing(s).frame) + 1) *
          timing(s).frame,
      ),
    });
  }
  e.events.push({
    second: at / 1000,
    message: `${type} / ${tif} order accepted for ${o.view.quantity} ${d.symbol}.${stop !== null ? " Stop is dormant." : match ? "" : " Waiting for the guided price."}`,
  });
  if (match) fill(e, o, price, at);
  else if (tif !== "GTC")
    cancel(e, o, at, "limit price not matchable immediately");
  assertSafe(e, s);
  if (!probe) risk(e, s, at);
  return o;
}
export function reconcile(e: Execution, s: Scenario, at: number): boolean {
  const jobs = e.orders
    .filter(pending)
    .flatMap((o) => [
      ...(o.stop !== null && o.view.triggeredAt === null
        ? [{ o, t: o.at + timing(s).trigger, kind: "trigger" as const }]
        : []),
      { o, t: o.at + timing(s).fill, kind: "fill" as const },
    ])
    .filter((j) => j.t <= at && j.t <= timing(s).duration)
    .sort(
      (a, b) =>
        a.t - b.t || (a.kind === b.kind ? 0 : a.kind === "trigger" ? -1 : 1),
    );
  const from = e.reconciledAt ?? -1;
  const times = new Set(jobs.map((j) => j.t));
  for (let t = 0; t <= timing(s).duration; t += timing(s).frame)
    if (t > from && t <= at) times.add(t);
  for (const g of e.guides)
    for (const t of [
      g.at,
      g.at + timing(s).trigger,
      g.at + timing(s).fill,
      g.until,
    ])
      if (t > from && t <= at) times.add(t);
  if (at >= from) times.add(at);
  let changed = false;
  for (const time of [...times].sort((a, b) => a - b)) {
    if (time < from) continue;
    changed = risk(e, s, time) || changed;
    for (const j of jobs.filter((j) => j.t === time)) {
      if (!pending(j.o)) continue;
      const price = quote(s, j.o.view.symbol, j.t, e.guides);
      if (j.kind === "trigger") {
        if (
          !(j.o.view.side === "buy" ? price >= j.o.stop! : price <= j.o.stop!)
        )
          throw Error("Invalid authored stop frame");
        j.o.view.triggeredAt = j.t / 1000;
        j.o.view.status = "TRIGGERED";
        e.events.push({
          second: j.t / 1000,
          message: `Stop triggered for ${j.o.view.symbol} at $${format(price)}. Its limit order is now active, not filled yet.`,
        });
      } else {
        if (!eligible(j.o.view.side, price, j.o.limit!))
          throw Error("Invalid authored limit frame");
        fill(e, j.o, price, j.t);
      }
      changed = true;
      changed = risk(e, s, time) || changed;
    }
  }
  e.reconciledAt = Math.max(from, at);
  return changed;
}

export function closePosition(
  e: Execution,
  s: Scenario,
  symbol: Symbol,
  at: number,
  reason: PositionClose["reason"],
) {
  const p = e.positions?.[symbol];
  if (!p) return null;
  const price = quote(s, symbol, at, e.guides);
  for (const o of e.orders.filter(
    (o) =>
      pending(o) && o.view.product === "perpetual" && o.view.symbol === symbol,
  ))
    cancel(e, o, at, reason);
  const o: InternalOrder = {
    system: true,
    view: {
      id: randomUUID(),
      product: "perpetual",
      reduceOnly: true,
      leverage: p.leverage,
      second: at / 1000,
      symbol,
      side: p.side === "buy" ? "sell" : "buy",
      quantity: qty(p.q),
      price: format(price),
      total: cash(product(p.q, price)),
      status: "PENDING",
      orderType: "MARKET",
      timeInForce: "IOC",
      limitPrice: null,
      stopPrice: null,
      filledAt: null,
      triggeredAt: null,
      reason,
      canCancel: false,
    },
    at,
    q: p.q,
    limit: null,
    stop: null,
    reservedCash: 0n,
    reservedAsset: 0n,
    guide: null,
    waited: false,
  };
  e.orders.push(o);
  fill(e, o, price, at, reason);
  return e.positionCloses!.at(-1)!;
}
export function risk(e: Execution, s: Scenario, at: number): boolean {
  let changed = false;
  for (const symbol of SYMBOLS) {
    const b = breach(e, symbol, quote(s, symbol, at, e.guides));
    if (!b) continue;
    const closed = closePosition(e, s, symbol, at, "liquidation")!;
    (e.liquidations ??= []).push({ ...closed, ...b });
    e.events.push({
      second: at / 1000,
      message: `${symbol} position liquidated: isolated equity $${b.equity} reached maintenance $${b.maintenance}. Realized PnL $${closed.realizedPnl}; training backstop $${closed.trainingBackstop}. Only this position's isolated collateral is charged.`,
    });
    changed = true;
  }
  return changed;
}
