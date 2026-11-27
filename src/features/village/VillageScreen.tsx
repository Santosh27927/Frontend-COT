"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerState } from "@/api/types";
import type {
  Asset,
  Building,
  EconomyQuote,
  QuoteRequest,
} from "@/api/economy-types";
import type { useLessonCommands } from "@/features/trading/useLessonCommands";
import GeneratorPanel from "./GeneratorPanel";
import QuoteDialog from "./QuoteDialog";
import QuestionHub from "./QuestionHub";
import HistoryDialog from "./HistoryDialog";
import type { HistoryPage } from "./HistoryDialog";

type Props = {
  state: PlayerState;
  delivery: ReturnType<typeof useLessonCommands>;
  loadQuote: (
    request: QuoteRequest,
  ) => Promise<{ quote: EconomyQuote; state: PlayerState }>;
  openLesson: () => Promise<void>;
  loadHistory: (cursor?: string) => Promise<HistoryPage>;
};

export function WalletStorage({
  state,
  delivery,
}: Pick<Props, "state" | "delivery">) {
  const economy = state.economy;
  return (
    <section className="economy-panel" aria-labelledby="wallet-storage-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Your continuing portfolio</span>
          <h2 id="wallet-storage-heading">Wallet storage</h2>
        </div>
        <span className="status-pill">Fictional funds</span>
      </div>
      <div className="table-scroll">
        <table className="storage-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Owned</th>
              <th>Capacity</th>
              <th>Free space</th>
            </tr>
          </thead>
          <tbody>
            {economy.wallet.map((row) => (
              <tr key={row.asset}>
                <th scope="row">
                  {row.asset === "USD" ? "Demo USD" : row.asset}
                </th>
                <td>{row.balance}</td>
                <td>{row.capacity === null ? "Unlimited" : row.capacity}</td>
                <td>{row.capacity === null ? "Unlimited" : row.free}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="field-help">
        Collector storage and wallet storage are separate. Asset capacities stay
        in asset units as prices change.
      </p>
      <div className="pending-credits">
        <h3>Pending credits</h3>
        <p className="muted">
          Earned amounts that do not fit remain protected here. Claim them when
          wallet space becomes available.
        </p>
        {economy.credits.some((credit) => credit.origins > 0) ? (
          economy.credits
            .filter((credit) => credit.origins > 0)
            .map((credit) => (
              <div className="credit-row" key={credit.asset}>
                <div>
                  <strong>
                    {credit.owed} {credit.asset} pending
                  </strong>
                  <span className="secondary-text">
                    {credit.claimable} fits now
                    {credit.fractionalRemainder
                      ? " · smaller fractions are retained"
                      : ""}
                  </span>
                </div>
                <button
                  disabled={
                    delivery.blocked ||
                    !economy.manualActionsAllowed ||
                    !credit.canClaim
                  }
                  onClick={() =>
                    void delivery.send({
                      action: "claim-credit",
                      asset: credit.asset,
                    })
                  }
                >
                  Claim {credit.asset}
                </button>
              </div>
            ))
        ) : (
          <p className="empty-state">No pending credits.</p>
        )}
      </div>
    </section>
  );
}

export default function VillageScreen({
  state,
  delivery,
  loadQuote,
  openLesson,
  loadHistory,
}: Props) {
  const economy = state.economy;
  const [building, setBuilding] = useState<Building>("town-hall");
  const [payment, setPayment] = useState<Asset>("USD");
  const [source, setSource] = useState<Asset>("USD");
  const [destination, setDestination] = useState<Asset>("ETC");
  const [quote, setQuote] = useState<EconomyQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const requestSequence = useRef(0);
  useEffect(
    () => () => {
      requestSequence.current++;
    },
    [],
  );
  // Read selection from UI state; all level, cost and eligibility values stay owned by the service.
  const selected = economy.buildings.find((row) => row.id === building);
  const paymentAsset = selected?.paymentAssets.includes(payment)
    ? payment
    : selected?.paymentAssets[0];
  const blocked = delivery.blocked || !economy.manualActionsAllowed || quoting;
  function clearQuote() {
    requestSequence.current++;
    setQuote(null);
    setQuoteError("");
    setQuoting(false);
  }
  async function requestQuote(request: QuoteRequest) {
    if (blocked || navigator.onLine === false) {
      setQuoteError("Reconnect before requesting a new quote.");
      return;
    }
    const sequence = ++requestSequence.current;
    setQuoting(true);
    setQuote(null);
    setQuoteError("");
    try {
      const response = await loadQuote(request);
      if (sequence === requestSequence.current) setQuote(response.quote);
    } catch (error) {
      if (sequence === requestSequence.current)
        setQuoteError(
          error instanceof Error
            ? error.message
            : "The quote could not be loaded. Try again.",
        );
    } finally {
      if (sequence === requestSequence.current) setQuoting(false);
    }
  }
  async function confirmQuote() {
    if (!quote || blocked) return;
    quote.kind === "conversion"
      ? await delivery.send({ action: "convert", quoteId: quote.id })
      : quote.kind === "upgrade"
        ? await delivery.send({ action: "upgrade", quoteId: quote.id })
        : await delivery.send({
            action: "cancel-upgrade",
            quoteId: quote.id,
            acknowledged: true,
          });
    // A rejected or uncertain delivery is explained by the shared transport banner.
    // Keep no stale quote that could be mistaken for a fresh confirmation.
    clearQuote();
  }
  return (
    <div className="village-content village-economy">
      <div className="village-intro">
        <div>
          <span className="eyebrow">
            Learning level {economy.learningLevel}
          </span>
          <h2>A village built by learning</h2>
          <p className="muted">
            Practice a lesson, collect resources, and plan your next upgrade.
          </p>
        </div>
        <button
          className="primary"
          disabled={delivery.blocked && !state.lesson}
          onClick={() => void openLesson()}
        >
          {state.lesson?.status === "active"
            ? "Resume demonstration"
            : state.lesson
              ? "Open learning hub"
              : "Start learning"}
        </button>
      </div>
      {economy.announcements.map((announcement) => (
        <p className="notice unlock-notice" key={announcement}>
          {announcement}
        </p>
      ))}
      {!economy.manualActionsAllowed && (
        <p className="notice">
          Your demonstration is active. Village actions reopen when it ends;
          production and construction continue.
        </p>
      )}
      <div className="village-overview">
        <section
          className="village-board"
          aria-label="Choose a village building"
        >
          <span className="village-cloud cloud-one" aria-hidden="true" />
          <span className="village-cloud cloud-two" aria-hidden="true" />
          <div className="village-ground" aria-hidden="true" />
          <div className="village-path" aria-hidden="true" />
          {economy.buildings.map((row) => (
            <button
              className={`building-tile building-${row.id.toLowerCase()} ${row.level === 0 ? "building-locked" : ""}`}
              key={row.id}
              aria-pressed={building === row.id}
              onClick={() => {
                clearQuote();
                setBuilding(row.id);
              }}
            >
              <span className="building-illustration" aria-hidden="true">
                <span className="building-roof" />
                <span className="building-walls">
                  <span className="building-door" />
                  <span className="building-window" />
                </span>
                <span className="building-emblem">
                  {row.id === "town-hall" ? "C" : row.id === "BTC" ? "₿" : "E"}
                </span>
              </span>
              <strong>{row.label}</strong>
              <span>
                {row.level ? `Level ${row.level}` : "Earn through lessons"}
              </span>
            </button>
          ))}
          <p className="board-caption">
            Select a building to inspect its next upgrade
          </p>
        </section>
        <section
          className="economy-panel building-inspector"
          aria-labelledby="building-heading"
        >
          <span className="eyebrow">Village workshop</span>
          <h2 id="building-heading">{selected?.label}</h2>
          <p className="building-level">
            {selected?.level ? `Level ${selected.level}` : "Not yet earned"}
          </p>
          <p>{selected?.reason}</p>
          {selected?.canUpgrade && (
            <>
              <label htmlFor="upgrade-payment">Pay with</label>
              <select
                id="upgrade-payment"
                disabled={blocked}
                value={paymentAsset}
                onChange={(event) => {
                  clearQuote();
                  setPayment(event.target.value as Asset);
                }}
              >
                {selected.paymentAssets.map((asset) => (
                  <option key={asset} value={asset}>
                    {asset === "USD" ? "Demo USD" : asset}
                  </option>
                ))}
              </select>
              <button
                className="primary"
                disabled={blocked || !paymentAsset}
                onClick={() =>
                  paymentAsset &&
                  void requestQuote({ kind: "upgrade", building, paymentAsset })
                }
              >
                Review upgrade cost
              </button>
            </>
          )}
          {economy.constructions
            .filter((construction) => construction.building === building)
            .map((construction) => (
              <div className="construction-card" key={construction.id}>
                <h3>Upgrading to level {construction.targetLevel}</h3>
                <p>
                  Finishes{" "}
                  <time dateTime={construction.finishesAt}>
                    {new Date(construction.finishesAt).toLocaleString()}
                  </time>
                </p>
                <p className="secondary-text">
                  Paid {construction.paid} {construction.asset}
                </p>
                <button
                  disabled={blocked || !construction.canCancel}
                  onClick={() =>
                    void requestQuote({
                      kind: "cancellation",
                      constructionId: construction.id,
                    })
                  }
                >
                  Review cancellation
                </button>
              </div>
            ))}
        </section>
      </div>
      <GeneratorPanel generators={state.generators} delivery={delivery} />
      <section
        className="economy-panel converter-panel"
        aria-labelledby="converter-heading"
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">Plan your resources</span>
            <h2 id="converter-heading">Resource converter</h2>
          </div>
          <span className="status-pill">
            {economy.converter.unlocked ? "Unlocked" : "Locked"}
          </span>
        </div>
        <p>{economy.converter.reason}</p>
        {economy.converter.nextAt && (
          <p className="field-help">
            Next conversion{" "}
            <time dateTime={economy.converter.nextAt}>
              {new Date(economy.converter.nextAt).toLocaleString()}
            </time>
            .
          </p>
        )}
        <p className="converter-principal">
          Fixed source value{" "}
          <strong>${economy.converter.principal} Demo USD</strong>{" "}
          <span className="bonus-pill">+{economy.converter.bonus} bonus</span>
        </p>
        <div className="converter-form">
          <div>
            <label htmlFor="converter-source">From</label>
            <select
              id="converter-source"
              value={source}
              disabled={blocked || !economy.converter.available}
              onChange={(event) => {
                clearQuote();
                setSource(event.target.value as Asset);
              }}
            >
              {economy.wallet.map((row) => (
                <option key={row.asset} value={row.asset}>
                  {row.asset === "USD" ? "Demo USD" : row.asset}
                </option>
              ))}
            </select>
          </div>
          <span className="conversion-arrow" aria-hidden="true">
            →
          </span>
          <div>
            <label htmlFor="converter-destination">To</label>
            <select
              id="converter-destination"
              value={destination}
              disabled={blocked || !economy.converter.available}
              onChange={(event) => {
                clearQuote();
                setDestination(event.target.value as Asset);
              }}
            >
              {economy.wallet.map((row) => (
                <option key={row.asset} value={row.asset}>
                  {row.asset === "USD" ? "Demo USD" : row.asset}
                </option>
              ))}
            </select>
          </div>
          <button
            className="primary"
            disabled={blocked || !economy.converter.available}
            onClick={() =>
              void requestQuote({ kind: "conversion", source, destination })
            }
          >
            Review conversion
          </button>
        </div>
        <p className="field-help">
          The service selects the amount and checks available funds and
          destination storage. Review the current quote before accepting
          volatility risk.
        </p>
        <div
          className="market-price-strip"
          aria-label="Current simulated prices"
        >
          {economy.prices.map((price) => (
            <div key={price.asset}>
              <span>{price.asset}</span>
              <strong>${price.price}</strong>
              <time dateTime={price.asOf}>
                Simulated · {new Date(price.asOf).toLocaleTimeString()}
              </time>
            </div>
          ))}
        </div>
      </section>
      {quoting && (
        <p className="notice" role="status">
          Loading your quote…
        </p>
      )}
      {quoteError && (
        <p className="notice error" role="alert">
          {quoteError}
        </p>
      )}
      <div className="village-lower-grid">
        <section
          className="economy-panel assistance-panel"
          aria-labelledby="assistance-heading"
        >
          <span className="eyebrow">A helping hand</span>
          <h2 id="assistance-heading">Emergency assist</h2>
          <p>{economy.assistance.reason}</p>
          <p className="assistance-amount">
            +{economy.assistance.grant} <span>Demo USD</span>
          </p>
          <button
            disabled={
              blocked ||
              !economy.assistance.available ||
              !economy.assistance.offerId
            }
            onClick={() =>
              economy.assistance.offerId &&
              void delivery.send({
                action: "claim-assistance",
                offerId: economy.assistance.offerId,
              })
            }
          >
            Claim assistance
          </button>
          {economy.assistance.policyStatus.startsWith("Development") && (
            <p className="field-help">{economy.assistance.policyStatus}</p>
          )}
        </section>
        <section
          className="economy-panel activity-panel"
          aria-labelledby="activity-heading"
        >
          <span className="eyebrow">Your village record</span>
          <h2 id="activity-heading">Recent activity</h2>
          {economy.history.length ? (
            <ol className="activity-list">
              {economy.history.slice(0, 5).map((event) => (
                <li key={event.id}>
                  <p>{event.message}</p>
                  <time dateTime={event.at}>
                    {new Date(event.at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">
              Your upgrades, conversions, and rewards will appear here.
            </p>
          )}
          <button className="history-open" onClick={() => setHistoryOpen(true)}>
            View activity history
          </button>
        </section>
      </div>
      <QuestionHub
        questions={economy.questions}
        manualActionsAllowed={economy.manualActionsAllowed}
        delivery={delivery}
      />
      {historyOpen && (
        <HistoryDialog
          loadHistory={loadHistory}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {quote && (
        <QuoteDialog
          key={quote.id}
          quote={quote}
          blocked={delivery.blocked || !economy.manualActionsAllowed}
          onClose={clearQuote}
          onConfirm={confirmQuote}
        />
      )}
    </div>
  );
}
