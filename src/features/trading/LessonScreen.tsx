"use client";
import { useEffect, useState } from "react";
import type { PlayerState } from "@/api/types";
import type { Report, Symbol, MarketGroup } from "@/api/market-types";
import type { useLessonCommands } from "./useLessonCommands";
import PriceChart from "./PriceChart";
import ReplayPanel from "./ReplayPanel";
import OrderForm from "./OrderForm";
import type { LoadPreview } from "./useOrderPreview";
import PositionPanel from "./PositionPanel";
type Delivery = ReturnType<typeof useLessonCommands>;
export default function LessonScreen({
  state,
  delivery,
  loadReport,
  loadPreview,
}: {
  state: PlayerState;
  delivery: Delivery;
  loadReport: (id: string) => Promise<Report>;
  loadPreview: LoadPreview;
}) {
  const a = state.lesson;
  const [market, setMarket] = useState<MarketGroup>(a?.group ?? "spot");
  const [symbol, setSymbol] = useState<Symbol>(a?.recommendedAsset ?? "ETC"),
    [reportId, setReportId] = useState<string | null>(null);
  useEffect(() => {
    if (a) {
      setSymbol(a.recommendedAsset);
      setReportId(null);
    }
  }, [a?.id]);
  const [selectedLesson, setSelectedLesson] = useState<string>(
    a?.lessonId ?? "market",
  );
  useEffect(() => {
    if (a?.status === "active") {
      setSelectedLesson(a.lessonId);
      setMarket(a.group ?? "spot");
    }
  }, [a?.id]);
  const visibleLessons = state.course.lessons.filter((l) => l.group === market);
  const selected =
    visibleLessons.find((l) => l.id === selectedLesson) ?? visibleLessons[0];
  const group = state.marketGroups.find((g) => g.id === market)!;
  return (
    <div className="learning-content">
      <div className="market-tabs">
        {state.marketGroups.map((g) => (
          <button
            key={g.id}
            className={g.id === market ? "selected" : ""}
            aria-pressed={g.id === market}
            disabled={
              !g.unlocked ||
              delivery.blocked ||
              (a?.status === "active" && g.id !== (a.group ?? "spot"))
            }
            title={g.lockedReason ?? undefined}
            onClick={() => {
              if (g.id === market) return;
              setMarket(g.id);
              setSelectedLesson(
                state.course.lessons.find((l) => l.group === g.id)!.id,
              );
            }}
          >
            {g.label}
            {!g.unlocked ? " · locked" : ""}
          </button>
        ))}
      </div>
      <div className="lesson-heading">
        <div>
          <span className="eyebrow">
            Level {group.level} · {selected.title}
          </span>
          <h2>
            {selected.id === "market"
              ? "Your first spot lesson"
              : selected.title}
          </h2>
          <p className="muted">
            Three guided scenarios · {selected.completed}/3 completed
          </p>
        </div>
        {a && (
          <span className="timer" aria-label="Lesson time remaining">
            {Math.floor(a.remainingSeconds / 60)
              .toString()
              .padStart(2, "0")}
            :{(a.remainingSeconds % 60).toString().padStart(2, "0")}
          </span>
        )}
      </div>
      <label htmlFor="lesson-select">
        {market === "spot"
          ? "Spot lesson"
          : market === "perpetual"
            ? "Perpetual lesson"
            : "Combined lesson"}
      </label>
      <select
        id="lesson-select"
        className="lesson-select"
        value={selected.id}
        disabled={a?.status === "active" || delivery.sending}
        onChange={(e) => setSelectedLesson(e.target.value)}
      >
        {visibleLessons.map((l) => (
          <option key={l.id} value={l.id}>
            {l.title} · {l.completed}/3{!l.unlocked ? " · locked" : ""}
          </option>
        ))}
      </select>
      {!selected.unlocked && <p className="notice">{selected.lockedReason}</p>}
      <details className="scenario-picker" open={a?.status !== "active"}>
        <summary>Scenario list · {selected.completed}/3 completed</summary>
        <div className="scenario-list">
          {selected.variants.map((s, i) => (
            <button
              key={s.id}
              disabled={
                delivery.blocked || a?.status === "active" || !selected.unlocked
              }
              onClick={() =>
                void delivery.send({ action: "start", variantId: s.id })
              }
            >
              <span className="scenario-number">{s.passed ? "✓" : i + 1}</span>
              <span>
                {s.title}
                <small>
                  {s.passed
                    ? "Completed · practice again"
                    : `Suggested asset: ${s.recommendedAsset}`}
                </small>
              </span>
            </button>
          ))}
        </div>
      </details>
      {a && a.lessonId === selected.id ? (
        <>
          <div hidden>
            <span data-testid="lesson-id">{a.id}</span>
            <span data-testid="lesson-deadline">{a.expiresAt}</span>
          </div>
          <div className="section-top">
            <h3>{a.title}</h3>
            {a.practice && <span className="practice-tag">Practice only</span>}
          </div>
          {a.practice && (
            <p className="notice">
              Practice uses a separate copy of your original example. Your real
              portfolio, progress and rewards stay protected.
            </p>
          )}
          {a.status === "active" ? (
            <>
              <div className="observation" role="status">
                <strong>{a.observation.message}</strong>
                {a.observation.secondsRemaining > 0 && (
                  <p>
                    Observation & review · {a.observation.secondsRemaining}s
                    remaining
                  </p>
                )}
                {a.canFastForward && (
                  <button
                    className="primary"
                    disabled={delivery.blocked}
                    onClick={() =>
                      void delivery.send({ action: "finish", attemptId: a.id })
                    }
                  >
                    Fast-forward
                  </button>
                )}
              </div>
              <ul className="goal-list">
                {a.goals.map((g) => (
                  <li key={g.id}>
                    {g.done ? "✓" : "○"} {g.label}
                  </li>
                ))}
              </ul>
              <div className="trading-grid">
                <PriceChart
                  quote={a.quotes.find((q) => q.symbol === symbol)!}
                />
                <OrderForm
                  key={a.id}
                  lesson={a}
                  revision={state.revision}
                  delivery={delivery}
                  loadPreview={loadPreview}
                  symbol={symbol}
                  onSymbol={setSymbol}
                />
              </div>
            </>
          ) : (
            <section className="result-card" aria-label="Scenario result">
              <span className="eyebrow">
                {a.practice ? "Practice result" : "Scenario result"}
              </span>
              <h3>
                {a.result!.passed
                  ? "Trading requirement met"
                  : "Try this scenario again"}
              </h3>
              <p>{a.result!.requirementSummary}</p>
              <dl className="metrics">
                <div>
                  <dt>Cash movement</dt>
                  <dd>${a.result!.cashChange}</dd>
                </div>
                <div>
                  <dt>Portfolio value change</dt>
                  <dd>${a.result!.portfolioValueChange}</dd>
                </div>
              </dl>
              <p className="field-help">
                Cash movement includes purchases and sales. Portfolio change
                includes asset value changes and excludes incoming generator
                resources at their collection value.
              </p>
              {a.result!.settlements.length > 0 && (
                <p>
                  Remaining lesson purchases closed into Demo USD. Earlier
                  holdings were preserved unless you sold them.
                </p>
              )}
              <div className="action-row">
                <button
                  className="primary"
                  disabled={delivery.blocked}
                  onClick={() =>
                    void delivery.send({
                      action: "start",
                      variantId: state.course.nextVariantId,
                    })
                  }
                >
                  {state.course.allComplete
                    ? "Practice first scenario"
                    : "Next scenario"}
                </button>
                <button
                  disabled={delivery.blocked}
                  onClick={() =>
                    void delivery.send({
                      action: "start",
                      variantId: a.variantId,
                    })
                  }
                >
                  {a.result!.passed ? "Practice again" : "Try again"}
                </button>
                <button onClick={() => setReportId(a.id)}>View replay</button>
              </div>
            </section>
          )}
          <div className="lesson-wallet">
            <div className="section-top">
              <h3>
                {a.practice ? "Practice portfolio" : "Your lesson portfolio"}
              </h3>
              <span className="secondary-text">Demo USD ${a.wallet.cash}</span>
            </div>
            <dl className="metrics">
              <div>
                <dt>Portfolio value</dt>
                <dd>${a.wallet.portfolioValue}</dd>
              </div>
              <div>
                <dt>Value change</dt>
                <dd>${a.portfolioValueChange}</dd>
              </div>
            </dl>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Owned</th>
                    <th>Value (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {a.wallet.holdings.map((h) => (
                    <tr key={h.asset}>
                      <td>{h.asset}</td>
                      <td>{h.quantity}</td>
                      <td>{h.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <PositionPanel lesson={a} delivery={delivery} />
          {a.orders.length > 0 && (
            <details className="fill-history" open>
              <summary>Orders & fills ({a.orders.length})</summary>
              <ol className="event-list">
                {a.orders.map((o) => (
                  <li key={o.id}>
                    <span>
                      {o.second}s · {o.status} · {o.orderType}/{o.timeInForce}
                    </span>
                    {o.status === "FILLED"
                      ? o.product === "perpetual"
                        ? `${o.reduceOnly ? "Reduced" : "Opened"} ${o.quantity} ${o.symbol} perpetual at $${o.price} · ${o.leverage}x · notional $${o.total}${o.reduceOnly ? ` · realized PnL $${o.realizedPnl}` : ""}`
                        : `${o.side === "buy" ? "Bought" : "Sold"} ${o.quantity} ${o.symbol} at $${o.price} · $${o.total}`
                      : `${o.side} ${o.quantity} ${o.symbol}${o.limitPrice ? ` · limit $${o.limitPrice}` : ""}${o.stopPrice ? ` · stop $${o.stopPrice}` : ""}${o.reason ? ` · ${o.reason}` : ""}`}
                    {o.canCancel && (
                      <button
                        disabled={delivery.blocked}
                        onClick={() =>
                          void delivery.send({
                            action: "cancel",
                            attemptId: a.id,
                            orderId: o.id,
                          })
                        }
                      >
                        Cancel {o.symbol} order
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      ) : (
        <p className="notice">
          Choose a scenario to begin. Use fictional funds to learn how a market
          order fills and how prices affect your holdings.
        </p>
      )}
      <section className="next-lesson">
        <h3>
          {market === "spot"
            ? state.course.spotPrerequisitesMet
              ? "Spot course complete"
              : "Your spot learning path"
            : market === "perpetual"
              ? "Your perpetual learning path"
              : "One portfolio · two products"}
        </h3>
        <p>
          {market !== "spot"
            ? "Complete three distinct scenarios in each lesson. Results and risk decisions come from the simulated service."
            : state.course.spotPrerequisitesMet
              ? "All12 distinct spot examples are complete. Perpetual lessons are now available."
              : "Complete three distinct scenarios per lesson: Market, GTC, IOC/FOK, then Stop-limit."}
        </p>
      </section>
      {state.reports.length > 0 && (
        <details className="report-history">
          <summary>Past scenarios & replays ({state.reports.length})</summary>
          {state.reports.map((r) => (
            <button key={r.attemptId} onClick={() => setReportId(r.attemptId)}>
              {r.title} ·{" "}
              {r.practice ? "Practice" : r.passed ? "Passed" : "Try again"}
            </button>
          ))}
        </details>
      )}
      {reportId && (
        <ReplayPanel
          id={reportId}
          load={loadReport}
          onClose={() => setReportId(null)}
        />
      )}
    </div>
  );
}
