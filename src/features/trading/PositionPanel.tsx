"use client";
import type { Comparison, Lesson, PositionClose } from "@/api/market-types";
import type { useLessonCommands } from "./useLessonCommands";

export function ComparisonPanel({ value: c }: { value: Comparison }) {
  return (
    <section
      className="position-panel comparison-panel"
      aria-label="Leverage comparison"
    >
      <h3>
        {c.policy === "same-size"
          ? "Same contract size · compare margin"
          : "Same collateral target · compare exposure"}
      </h3>
      <p>{c.message}</p>
      <div className="comparison-grid">
        {[c.baseline, c.paired].map((f, i) => (
          <article key={i}>
            <h4>{i === 0 ? "1x baseline" : "2x comparison"}</h4>
            {f ? (
              <>
                <p>
                  {f.side === "buy" ? "Long" : "Short"} {f.quantity} {f.symbol}{" "}
                  at ${f.price}
                </p>
                <dl className="metrics">
                  <div>
                    <dt>Isolated margin</dt>
                    <dd>${f.margin}</dd>
                  </div>
                  <div>
                    <dt>Entry exposure</dt>
                    <dd>${f.notional}</dd>
                  </div>
                  <div>
                    <dt>10% favorable move</dt>
                    <dd>${f.illustrativeGain}</dd>
                  </div>
                  <div>
                    <dt>10% adverse move</dt>
                    <dd>${f.illustrativeLoss}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="muted">Place this actual trade to compare.</p>
            )}
          </article>
        ))}
      </div>
      {c.targetQuantity !== null && (
        <p>
          Current 2x target:{" "}
          <strong>
            {c.targetQuantity} {c.baseline?.symbol}
          </strong>
        </p>
      )}
      {c.collateralDifference !== null && (
        <p>
          Actual collateral difference from quantity rounding: $
          {c.collateralDifference}
        </p>
      )}
      <p className="field-help">
        The 10% figures are hypothetical PnL from each fill's own entry price.
        Actual entries can occur at different prices. They are separate from
        your realized results.
      </p>
    </section>
  );
}
export function CloseHistory({ closes }: { closes: PositionClose[] }) {
  if (!closes.length) return null;
  return (
    <section className="position-panel" aria-label="Position closing history">
      <h3>Position closes and realized PnL</h3>
      <ol className="event-list">
        {closes.map((c, i) => (
          <li key={i}>
            <span>
              {c.second}s · {c.reason} · {c.symbol}
            </span>
            Closed {c.quantity} {c.symbol} at ${c.price}; margin released $
            {c.marginReleased}; realized PnL ${c.realizedPnl}.{" "}
            {c.reason === "liquidation" && (
              <>
                Raw PnL ${c.rawPnl}; training backstop ${c.trainingBackstop}.
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
export default function PositionPanel({
  lesson: a,
  delivery,
}: {
  lesson: Lesson;
  delivery: ReturnType<typeof useLessonCommands>;
}) {
  if (!a.positions && !a.comparison) return null;
  return (
    <div className="position-area">
      {a.comparison && <ComparisonPanel value={a.comparison} />}
      <section className="position-panel" aria-label="Perpetual positions">
        <h3>Perpetual positions</h3>
        <p className="field-help">
          Cash includes committed collateral. Available cash excludes it.
          Unrealized PnL is not spendable; closing posts realized PnL to Demo
          USD.
        </p>
        <dl className="metrics">
          <div>
            <dt>Available cash</dt>
            <dd>${a.wallet.availableCash}</dd>
          </div>
          <div>
            <dt>Committed margin</dt>
            <dd>${a.wallet.committedMargin}</dd>
          </div>
          <div>
            <dt>Unrealized PnL</dt>
            <dd>${a.wallet.unrealizedPnl}</dd>
          </div>
        </dl>
        {!a.positions?.length && <p>No open perpetual positions.</p>}
        <div className="comparison-grid">
          {a.positions?.map((p) => (
            <article key={p.id} aria-label={`${p.symbol} position`}>
              <h4>
                {p.symbol} · {p.side === "buy" ? "Long" : "Short"} ·{" "}
                {p.leverage}x
              </h4>
              <p>
                {p.quantity} contracts · average entry ${p.entryPrice}
              </p>
              <dl className="metrics">
                <div>
                  <dt>Entry notional</dt>
                  <dd>${p.entryNotional}</dd>
                </div>
                <div>
                  <dt>Current exposure</dt>
                  <dd>${p.currentNotional}</dd>
                </div>
                <div>
                  <dt>Margin</dt>
                  <dd>${p.margin}</dd>
                </div>
                <div>
                  <dt>Unrealized PnL</dt>
                  <dd>${p.unrealizedPnl}</dd>
                </div>
                <div>
                  <dt>Isolated equity</dt>
                  <dd>${p.equity}</dd>
                </div>
                <div>
                  <dt>Maintenance</dt>
                  <dd>${p.maintenance}</dd>
                </div>
              </dl>
              <p>Available to close: {p.availableQuantity}</p>
              <button
                disabled={delivery.blocked || !p.closeOrder}
                onClick={() =>
                  p.closeOrder &&
                  void delivery.send({
                    action: "order",
                    attemptId: a.id,
                    ...p.closeOrder,
                  })
                }
              >
                Close available {p.symbol}
              </button>
            </article>
          ))}
        </div>
      </section>
      {a.liquidations?.map((l, i) => (
        <section
          className="position-panel liquidation-panel"
          aria-label={`${l.symbol} liquidation`}
          key={i}
        >
          <h3>
            {l.symbol} liquidated at {l.second}s
          </h3>
          <p>
            Isolated equity ${l.equity} reached maintenance ${l.maintenance}.
            The position closed at ${l.price}.
          </p>
          <p>
            Collateral released: ${l.marginReleased}. Recognized PnL: $
            {l.realizedPnl}. Raw PnL: ${l.rawPnl}. Training backstop: $
            {l.trainingBackstop}.
          </p>
          <p className="field-help">
            This versioned teaching model caps the loss at this position's
            collateral. The gap backstop is not an exchange guarantee. Other
            positions and owned asset units are protected.
          </p>
        </section>
      ))}
      {a.marginRejection && (
        <section
          className="position-panel"
          aria-label="Shared margin explanation"
        >
          <h3>Why the spot buy was rejected</h3>
          <p>
            The order needed ${a.marginRejection.requiredCash}, but only $
            {a.marginRejection.availableCash} was available because $
            {a.marginRejection.committedMargin} was committed to margin. The
            rejected order moved no cash or assets.
          </p>
          <p>
            Reduce the spot quantity or release margin, then place an affordable
            spot buy.
          </p>
        </section>
      )}
      <CloseHistory closes={a.result?.positionCloses ?? []} />
    </div>
  );
}
