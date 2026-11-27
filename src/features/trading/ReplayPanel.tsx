"use client";
import { useEffect, useState } from "react";
import type { Report, Symbol } from "@/api/market-types";
import PriceChart from "./PriceChart";
import { CloseHistory, ComparisonPanel } from "./PositionPanel";
export default function ReplayPanel({
  id,
  load,
  onClose,
}: {
  id: string;
  load: (id: string) => Promise<Report>;
  onClose: () => void;
}) {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState("");
  const [symbol, setSymbol] = useState<Symbol>("ETC");
  useEffect(() => {
    let alive = true;
    setReport(null);
    setError("");
    load(id)
      .then((r) => {
        if (alive) {
          setReport(r);
          setSymbol(r.orders[0]?.symbol ?? "ETC");
        }
      })
      .catch((e) => {
        if (alive)
          setError(e instanceof Error ? e.message : "Unable to load replay.");
      });
    return () => {
      alive = false;
    };
  }, [id, load]);
  return (
    <section className="replay-panel" aria-label="Scenario replay">
      <div className="section-top">
        <h3>Scenario replay</h3>
        <button onClick={onClose}>Close replay</button>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !report ? (
        <p role="status">Loading replay…</p>
      ) : (
        <>
          <p>
            {report.title} ·{" "}
            {report.practice
              ? "Practice only"
              : report.result.passed
                ? "Passed"
                : "Try again"}
          </p>
          <p className="muted">
            Read-only history. Opening this replay never changes your balance.
          </p>
          <dl className="metrics">
            <div>
              <dt>Cash movement</dt>
              <dd>${report.result.cashChange}</dd>
            </div>
            <div>
              <dt>Portfolio value change</dt>
              <dd>${report.result.portfolioValueChange}</dd>
            </div>
          </dl>
          <label htmlFor="replay-asset">Replay asset</label>
          <select
            id="replay-asset"
            className="lesson-select"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value as Symbol)}
          >
            {report.quotes.map((q) => (
              <option key={q.symbol} value={q.symbol}>
                {q.symbol}
              </option>
            ))}
          </select>
          <PriceChart quote={report.quotes.find((q) => q.symbol === symbol)!} />
          {report.comparison && <ComparisonPanel value={report.comparison} />}
          <CloseHistory closes={report.result.positionCloses ?? []} />
          <ol className="event-list">
            {report.events.map((e, i) => (
              <li key={i}>
                <span>{e.second}s</span>
                {e.message}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
