"use client";
import { useEffect, useState } from "react";
import type { Lesson, OrderDraft, Symbol, Product } from "@/api/market-types";
import type { useLessonCommands } from "./useLessonCommands";
import { useOrderPreview } from "./useOrderPreview";
import type { LoadPreview } from "./useOrderPreview";
export default function OrderForm({
  lesson: a,
  revision,
  delivery,
  loadPreview,
  symbol,
  onSymbol,
}: {
  lesson: Lesson;
  revision: number;
  delivery: ReturnType<typeof useLessonCommands>;
  loadPreview: LoadPreview;
  symbol: Symbol;
  onSymbol: (symbol: Symbol) => void;
}) {
  const [quantity, setQuantity] = useState(a.defaultQuantity),
    [side, setSide] = useState<"buy" | "sell">("buy"),
    [policy, setPolicy] = useState(a.form.defaultOptionId),
    [limitPrice, setLimit] = useState<string | null>(null),
    [stopPrice, setStop] = useState<string | null>(null),
    [product, setProduct] = useState<Product>(a.form.defaultProduct ?? "spot"),
    [leverage, setLeverage] = useState(a.form.defaultLeverage ?? 1),
    [reduceOnly, setReduceOnly] = useState(false);
  const option =
    a.form.options.find((o) => o.id === policy) ?? a.form.options[0];
  const defaults = a.form.defaults.find(
    (d) => d.symbol === symbol && d.side === side,
  )!;
  useEffect(() => {
    setQuantity(a.defaultQuantity);
    setSide("buy");
    setPolicy(a.form.defaultOptionId);
    setLimit(null);
    setStop(null);
    setProduct(a.form.defaultProduct ?? "spot");
    setLeverage(a.form.defaultLeverage ?? 1);
    setReduceOnly(false);
  }, [a.id]);
  const draft: OrderDraft = {
    attemptId: a.id,
    symbol,
    side,
    quantity,
    orderType: option.orderType,
    timeInForce: option.timeInForce,
    ...(product === "perpetual"
      ? { product, reduceOnly, ...(!reduceOnly ? { leverage } : {}) }
      : {}),
    ...(option.showLimit
      ? { limitPrice: limitPrice ?? defaults.limitPrice }
      : {}),
    ...(option.showStop ? { stopPrice: stopPrice ?? defaults.stopPrice } : {}),
  };
  const { preview, error, retry } = useOrderPreview(
    draft,
    revision,
    JSON.stringify(a.quotes.map((q) => q.price)),
    loadPreview,
  );
  const currentQuote = a.quotes.find((q) => q.symbol === symbol);
  const pendingOrder = a.orders.find((o) => o.symbol === symbol && o.canCancel);
  const blockedByPending = preview?.blockedByPendingOrder === true;
  return (
    <form
      className="order-form"
      onSubmit={(e) => {
        e.preventDefault();
        void delivery.send({ action: "order", ...draft });
      }}
    >
      <span className="eyebrow">{a.lessonTitle}</span>
      {(a.form.products?.length ?? 0) > 1 && (
        <>
          <label htmlFor="trade-product">Trading product</label>
          <select
            id="trade-product"
            value={product}
            disabled={delivery.editingBlocked}
            onChange={(e) => {
              setProduct(e.target.value as Product);
              setReduceOnly(false);
            }}
          >
            {a.form.products!.map((p) => (
              <option key={p} value={p}>
                {p === "spot" ? "Spot" : "Perpetual"}
              </option>
            ))}
          </select>
        </>
      )}
      {product === "perpetual" && (
        <>
          <label htmlFor="trade-leverage">Leverage</label>
          <select
            id="trade-leverage"
            value={leverage}
            disabled={delivery.editingBlocked || reduceOnly}
            onChange={(e) => setLeverage(Number(e.target.value))}
          >
            {a.form.leverages?.map((l) => (
              <option key={l} value={l}>
                {l}x
              </option>
            ))}
          </select>
          <label className="reduce-control">
            <input
              type="checkbox"
              checked={reduceOnly}
              disabled={delivery.editingBlocked}
              onChange={(e) => setReduceOnly(e.target.checked)}
            />
            Reduce an existing position
          </label>
          <p className="field-help">
            Buy opens long; sell opens short. Reduce-only uses the opposite
            direction and cannot reverse or enlarge a position.
          </p>
        </>
      )}
      {a.comparison?.nextOrder && (
        <button
          type="button"
          disabled={delivery.editingBlocked}
          onClick={() => {
            const next = a.comparison!.nextOrder!;
            setProduct(next.product!);
            setLeverage(next.leverage!);
            setReduceOnly(false);
            onSymbol(next.symbol);
            setSide(next.side);
            setQuantity(next.quantity);
            setPolicy("MARKET:IOC");
            setLimit(null);
            setStop(null);
          }}
        >
          Use 2x comparison quantity
        </button>
      )}
      {a.sharedFundsExample && (
        <button
          type="button"
          disabled={delivery.editingBlocked}
          onClick={() => {
            setProduct("spot");
            setReduceOnly(false);
            setSide("buy");
            onSymbol(a.sharedFundsExample!.symbol);
            setQuantity(a.sharedFundsExample!.quantity);
            setPolicy("MARKET:IOC");
          }}
        >
          Use margin-rejection spot example
        </button>
      )}
      <div className="side-toggle">
        <button
          type="button"
          aria-pressed={side === "buy"}
          disabled={delivery.editingBlocked}
          onClick={() => {
            setSide("buy");
            setLimit(null);
            setStop(null);
          }}
        >
          Buy
        </button>
        <button
          type="button"
          aria-pressed={side === "sell"}
          disabled={delivery.editingBlocked}
          onClick={() => {
            setSide("sell");
            setLimit(null);
            setStop(null);
          }}
        >
          Sell
        </button>
      </div>
      <label htmlFor="trade-asset">Asset</label>
      <select
        id="trade-asset"
        value={symbol}
        disabled={delivery.editingBlocked}
        onChange={(e) => {
          onSymbol(e.target.value as Symbol);
          setLimit(null);
          setStop(null);
        }}
      >
        {a.quotes.map((q) => (
          <option key={q.symbol} value={q.symbol}>
            {q.symbol}
          </option>
        ))}
      </select>
      <div className="current-price" aria-label={`Current ${symbol} price`}>
        <span>Current {symbol} price</span>
        <strong>
          {currentQuote ? `$${currentQuote.price}` : "Unavailable"}
        </strong>
        <small>Scripted market · Demo USD</small>
      </div>
      <label htmlFor="trade-policy">Order policy</label>
      <select
        id="trade-policy"
        value={option.id}
        disabled={delivery.editingBlocked}
        onChange={(e) => {
          setPolicy(e.target.value);
          setLimit(null);
          setStop(null);
        }}
      >
        {a.form.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {option.showLimit && (
        <>
          <label htmlFor="trade-limit">Limit price (Demo USD)</label>
          <input
            id="trade-limit"
            inputMode="decimal"
            maxLength={25}
            value={limitPrice ?? defaults.limitPrice}
            disabled={delivery.editingBlocked}
            onChange={(e) => setLimit(e.target.value)}
          />
        </>
      )}
      {option.showStop && (
        <>
          <label htmlFor="trade-stop">Stop price (Demo USD)</label>
          <input
            id="trade-stop"
            inputMode="decimal"
            maxLength={25}
            value={stopPrice ?? defaults.stopPrice}
            disabled={delivery.editingBlocked}
            onChange={(e) => setStop(e.target.value)}
          />
        </>
      )}
      <label htmlFor="trade-quantity">Quantity</label>
      <input
        id="trade-quantity"
        value={quantity}
        disabled={delivery.editingBlocked}
        onChange={(e) => setQuantity(e.target.value)}
        inputMode="decimal"
        maxLength={25}
        autoComplete="off"
        aria-describedby="quantity-help order-limits"
      />
      <p id="quantity-help" className="field-help">
        {product === "spot"
          ? `${a.form.assetRules?.[symbol] ? `Up to ${a.form.assetRules[symbol].quantityDecimals} decimal places. ` : ""}Buy uses Demo USD; sell uses owned assets.`
          : `${a.form.assetRules?.[symbol] ? `Up to ${a.form.assetRules[symbol].quantityDecimals} decimal places. ` : ""}Opening reserves isolated margin; closing realizes PnL. Exposure is separate from owned spot assets.`}
      </p>
      <div id="order-limits" className="order-limits" aria-live="polite">
        {preview ? (
          <>
            <p>
              Available Demo USD: <strong>{preview.availableCash}</strong>
            </p>
            <p>Reserved Demo USD: {preview.reservedCash}</p>
            {preview.product === "perpetual" && (
              <>
                <p>
                  Committed margin: <strong>{preview.committedMargin}</strong>
                </p>
                <p>Order notional: {preview.notional ?? "Unavailable"}</p>
                <p>
                  Required margin: {preview.marginRequired ?? "Unavailable"}
                </p>
              </>
            )}
            <p>
              {product === "perpetual"
                ? "Unreserved contracts"
                : `Available ${symbol}`}
              : <strong>{preview.availableAsset}</strong>
            </p>
            <p>
              Maximum {side} quantity:{" "}
              <strong>
                {preview.maxQuantity ?? "Unavailable"} {symbol}
              </strong>
            </p>
            {preview.reason && !blockedByPending && (
              <p className="field-error">{preview.reason}</p>
            )}
          </>
        ) : (
          <>
            <p>{error || "Checking available balance and order limit…"}</p>
            {error && (
              <button type="button" disabled={delivery.sending} onClick={retry}>
                Retry order check
              </button>
            )}
          </>
        )}
      </div>
      {pendingOrder && (
        <aside
          className="pending-order"
          role="status"
          aria-label={`Your pending ${symbol} order`}
        >
          <strong>
            {pendingOrder.status === "TRIGGERED"
              ? "Stop activated — limit order waiting to fill"
              : "Order placed — waiting to fill"}
          </strong>
          <p>
            {pendingOrder.side === "buy" ? "Buy" : "Sell"}{" "}
            {pendingOrder.quantity} {pendingOrder.symbol} ·{" "}
            {pendingOrder.orderType}/{pendingOrder.timeInForce}
          </p>
          {pendingOrder.limitPrice && (
            <p>Order limit: ${pendingOrder.limitPrice} Demo USD</p>
          )}
          {pendingOrder.stopPrice && (
            <p>Order stop: ${pendingOrder.stopPrice} Demo USD</p>
          )}
          <p className="field-help">
            This order has been accepted. Its reserved balance is shown above.
            You can wait for it to fill or cancel it.
          </p>
          <button
            type="button"
            disabled={delivery.blocked}
            onClick={() =>
              void delivery.send({
                action: "cancel",
                attemptId: a.id,
                orderId: pendingOrder.id,
              })
            }
          >
            Cancel pending {pendingOrder.symbol} order
          </button>
        </aside>
      )}
      <button
        className="primary full"
        disabled={delivery.blocked || !preview || blockedByPending}
        type="submit"
      >
        {delivery.sending
          ? "Sending…"
          : !preview
            ? error
              ? "Order check unavailable"
              : "Checking order…"
            : blockedByPending
              ? "Order pending"
              : `Place ${side} order`}
      </button>
      <p className="field-help">{a.form.guidance}</p>
    </form>
  );
}
