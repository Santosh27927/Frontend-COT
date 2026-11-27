"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { api, isSessionEnded, isStateAtLeastAsNew } from "@/api/client";
import type { PlayerState } from "@/api/types";
import { pinError, usernameError } from "@/shared/validation";
import PinField from "./PinField";
import type { Command, OrderDraft } from "@/api/market-types";
import { useLessonCommands } from "@/features/trading/useLessonCommands";
import LessonScreen from "@/features/trading/LessonScreen";
import VillageScreen, { WalletStorage } from "@/features/village/VillageScreen";
import type { QuoteRequest } from "@/api/economy-types";

function readStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* The temporary demo also works with storage disabled. */
  }
}
function Modal({
  title,
  children,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  onCancel?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-heading"
      onCancel={(event) => {
        event.preventDefault();
        onCancel?.();
      }}
    >
      <span className="eyebrow">Your account</span>
      <h2 id="dialog-heading">{title}</h2>
      {children}
    </dialog>
  );
}

export default function PlayerApp() {
  const [deviceId, setDeviceId] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<PlayerState | null>(null);
  const [booting, setBooting] = useState(true);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [network, setNetwork] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [tab, setTab] = useState("village");
  const context = useRef({
    generation: 0,
    token: null as string | null,
    deviceId: "",
  });
  const latest = useRef<PlayerState | null>(null);

  const adopt = useCallback(
    (state: PlayerState, generation: number, expectedToken: string) => {
      if (
        context.current.generation !== generation ||
        context.current.token !== expectedToken ||
        !isStateAtLeastAsNew(state, latest.current)
      )
        return false;
      latest.current = state;
      setView(state);
      setNetwork("");
      return true;
    },
    [],
  );

  const clearSession = useCallback((notice = "", replaced = false) => {
    const id = context.current.deviceId;
    context.current = {
      generation: context.current.generation + 1,
      token: null,
      deviceId: id,
    };
    latest.current = null;
    writeStorage(`cot.demo.token.${id}`, null);
    setToken(null);
    setView(null);
    setPin("");
    setSessionNotice(replaced ? notice : "");
    setMessage(notice);
    setNetwork("");
    setBooting(false);
    setBusy(false);
  }, []);

  const refresh = useCallback(
    async (sessionToken: string) => {
      const generation = context.current.generation;
      try {
        adopt(await api.state(sessionToken), generation, sessionToken);
      } catch (error) {
        if (
          context.current.generation !== generation ||
          context.current.token !== sessionToken
        )
          return;
        if (isSessionEnded(error))
          clearSession(error.message, error.code === "SESSION_REPLACED");
        else
          setNetwork(
            "Connecting to the demo service. Your shared lesson clock continues.",
          );
      } finally {
        if (context.current.generation === generation) setBooting(false);
      }
    },
    [adopt, clearSession],
  );

  useEffect(() => {
    const selected = new URLSearchParams(location.search).get("device");
    let id = selected && /^[A-D]$/.test(selected) ? selected : "";
    if (!id) {
      try {
        id = localStorage.getItem("cot.demo.device") || crypto.randomUUID();
        localStorage.setItem("cot.demo.device", id);
      } catch {
        id = crypto.randomUUID();
      }
    }
    const saved = readStorage(`cot.demo.token.${id}`);
    context.current = {
      generation: context.current.generation + 1,
      token: saved,
      deviceId: id,
    };
    latest.current = null;
    setDeviceId(id);
    setToken(saved);
    if (!saved) setBooting(false);
    return () => {
      context.current.generation++;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    void refresh(token);
    const interval = setInterval(() => {
      void refresh(token);
    }, 1000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh(token);
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [token, refresh]);

  async function signIn(event?: FormEvent) {
    event?.preventDefault();
    setTouched(true);
    if (usernameError(username) || pinError(pin)) return;
    const generation = ++context.current.generation;
    setBusy(true);
    setMessage("");
    setSessionNotice("");
    try {
      const result = await api.signIn(username, pin, deviceId);
      if (context.current.generation !== generation) return;
      context.current.token = result.token;
      latest.current = null;
      writeStorage(`cot.demo.token.${deviceId}`, result.token);
      setToken(result.token);
      adopt(result.state, generation, result.token);
      setPin("");
      setTab("village");
    } catch (error) {
      if (context.current.generation !== generation) return;
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to sign in. Try again.",
      );
    } finally {
      if (context.current.generation === generation) setBusy(false);
    }
  }

  const sessionRequest = useCallback(
    async <T,>(
      run: (token: string) => Promise<T>,
      stateOf?: (value: T) => PlayerState,
      quiet = false,
    ): Promise<T> => {
      const captured = { ...context.current };
      if (!captured.token) throw new Error("Sign in to continue.");
      if (!quiet) setBusy(true);
      try {
        const value = await run(captured.token);
        if (
          context.current.generation !== captured.generation ||
          context.current.token !== captured.token
        )
          throw new Error("Session changed.");
        if (stateOf) adopt(stateOf(value), captured.generation, captured.token);
        return value;
      } catch (error) {
        if (
          context.current.generation === captured.generation &&
          context.current.token === captured.token &&
          isSessionEnded(error)
        )
          clearSession(error.message, error.code === "SESSION_REPLACED");
        throw error;
      } finally {
        if (!quiet && context.current.generation === captured.generation)
          setBusy(false);
      }
    },
    [adopt, clearSession],
  );
  const submitCommand = useCallback(
    (command: Command) =>
      sessionRequest(
        (t) => api.command(t, command),
        (r) => r.state,
      ),
    [sessionRequest],
  );
  const loadReport = useCallback(
    (id: string) => sessionRequest((t) => api.report(t, id)),
    [sessionRequest],
  );
  const loadPreview = useCallback(
    (draft: OrderDraft) =>
      sessionRequest(
        (t) => api.preview(t, draft),
        (r) => r.state,
        true,
      ),
    [sessionRequest],
  );
  const loadHistory = useCallback(
    (cursor?: string) =>
      sessionRequest((t) => api.history(t, cursor), undefined, true),
    [sessionRequest],
  );
  const loadQuote = useCallback(
    (input: QuoteRequest) =>
      sessionRequest(
        (t) => api.quote(t, input),
        (r) => r.state,
        true,
      ),
    [sessionRequest],
  );
  async function advanceWorld(hours: number) {
    try {
      await sessionRequest(
        (t) => api.advanceWorld(t, hours),
        (r) => r,
      );
    } catch (error) {
      if (!isSessionEnded(error))
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to advance the world clock.",
        );
    }
  }
  async function advanceResources(hours: number) {
    try {
      await sessionRequest(
        (t) => api.advanceResources(t, hours),
        (r) => r,
      );
    } catch (error) {
      if (!isSessionEnded(error))
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to advance resources.",
        );
    }
  }
  const delivery = useLessonCommands(
    view?.playerId ?? null,
    view?.confirmedIntentIds ?? [],
    submitCommand,
  );
  async function openLesson() {
    if (view?.lesson) {
      setTab("learn");
      return;
    }
    if (await delivery.send({ action: "start" })) setTab("learn");
  }
  async function advanceLesson(seconds: number) {
    const id = view?.lesson?.id;
    if (!id) return;
    try {
      await sessionRequest(
        (t) => api.advance(t, id, seconds),
        (r) => r,
      );
    } catch (error) {
      if (!isSessionEnded(error))
        setMessage(
          error instanceof Error ? error.message : "Unable to advance lesson.",
        );
    }
  }

  async function signOut() {
    const captured = { ...context.current };
    if (!captured.token || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api.signOut(captured.token);
      if (
        context.current.generation === captured.generation &&
        context.current.token === captured.token
      )
        clearSession();
    } catch (error) {
      if (
        context.current.generation !== captured.generation ||
        context.current.token !== captured.token
      )
        return;
      if (isSessionEnded(error)) {
        clearSession(error.message, error.code === "SESSION_REPLACED");
      } else {
        setMessage(
          "Sign out could not be confirmed. Reconnect and try again. Your session is retained for recovery.",
        );
      }
    } finally {
      if (context.current.generation === captured.generation) setBusy(false);
    }
  }

  const nameProblem = usernameError(username);
  const invalidName = (touched || username.length > 0) && nameProblem;
  const active = view?.mode === "active" ? view : null;
  function dismissSessionNotice() {
    setSessionNotice("");
    setMessage("");
  }

  return (
    <>
      <div className="demo-banner">Practice account · fictional funds</div>
      <main className="app-frame">
        <header className="brand-bar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              C
            </span>
            <div>
              <strong>COT</strong>
              <span>Your trading village</span>
            </div>
          </div>
        </header>
        {message && !sessionNotice && (
          <p className="notice error" role="alert">
            {message}
          </p>
        )}
        {network && (
          <p className="notice" role="status">
            {network}
          </p>
        )}
        {booting ? (
          <div className="loading" role="status">
            Restoring your demo session…
          </div>
        ) : !view ? (
          <section className="welcome-grid">
            <div className="welcome-story">
              <span className="eyebrow">Learn. Practice. Grow.</span>
              <h1>
                A small village.
                <br />A smarter trader.
              </h1>
              <p>
                Build your understanding with guided trading lessons and
                fictional funds.
              </p>
              <div className="village-art" aria-hidden="true">
                <div className="island">
                  <span className="house house-main" />
                  <span className="house house-small" />
                  <span className="house house-tiny" />
                </div>
              </div>
              <span className="story-foot">
                Android first · paper trading only
              </span>
            </div>
            <div className="sign-in">
              <span className="eyebrow">Welcome back</span>
              <h2>Enter your village</h2>
              <p className="muted">
                Use the account name and PIN assigned for testing.
              </p>
              <form onSubmit={(event) => void signIn(event)} noValidate>
                <label htmlFor="username">Account name</label>
                <input
                  id="username"
                  name="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  onBlur={() => setTouched(true)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={Boolean(invalidName)}
                  aria-describedby="username-help"
                  placeholder="e.g. learner"
                />
                <p
                  id="username-help"
                  className={invalidName ? "field-error" : "field-help"}
                  role={invalidName ? "alert" : undefined}
                >
                  {invalidName ||
                    "Lowercase letters a–z only. Maximum 10 characters."}
                </p>
                <PinField value={pin} onChange={setPin} showError={touched} />
                <button
                  className="primary full"
                  disabled={
                    busy || Boolean(nameProblem) || Boolean(pinError(pin))
                  }
                  type="submit"
                >
                  {busy ? "Signing in…" : "Sign in"}
                </button>
              </form>
              <p className="private-note">
                Private test access. There is no public sign-up. Signing in here
                signs out your other device.
              </p>
            </div>
          </section>
        ) : active ? (
          <section className="player-shell">
            <div className="player-heading">
              <div>
                <span className="eyebrow">Welcome, {active.username}</span>
                <h1>Your village</h1>
              </div>
              <div className="wallet">
                <span>Demo USD</span>
                <strong>{active.demoUsd}</strong>
              </div>
            </div>
            <nav className="app-nav" aria-label="Player navigation">
              {["village", "learn", "portfolio"].map((name) => (
                <button
                  key={name}
                  aria-pressed={tab === name}
                  disabled={busy || delivery.sending}
                  onClick={() => setTab(name)}
                >
                  {name === "learn"
                    ? "Learn"
                    : name.charAt(0).toUpperCase() + name.slice(1)}
                </button>
              ))}
              <button
                className="sign-out"
                disabled={busy || delivery.sending}
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </nav>
            {(delivery.message || delivery.pending) && (
              <div className="notice delivery-status" role="status">
                <p>
                  {delivery.message ||
                    "An earlier command is awaiting confirmation. Retry the saved command before making another trade."}
                </p>
                {delivery.pending && (
                  <button
                    disabled={delivery.sending || !delivery.ready}
                    onClick={() => void delivery.retry()}
                  >
                    Retry original command
                  </button>
                )}
              </div>
            )}
            {tab === "village" ? (
              <VillageScreen
                key={active.playerId}
                state={active}
                delivery={delivery}
                loadQuote={loadQuote}
                loadHistory={loadHistory}
                openLesson={openLesson}
              />
            ) : tab === "learn" ? (
              <LessonScreen
                state={active}
                delivery={delivery}
                loadReport={loadReport}
                loadPreview={loadPreview}
              />
            ) : (
              <div className="portfolio-content">
                <WalletStorage state={active} delivery={delivery} />
              </div>
            )}
            <footer className="player-footer">
              <span className="secondary-text">Fictional funds</span>
            </footer>
          </section>
        ) : null}
      </main>
      {view && delivery.funds && !sessionNotice && (
        <Modal title="Insufficient balance" onCancel={delivery.dismissFunds}>
          <p>
            {delivery.funds.side === "buy"
              ? "Not enough Demo USD for this order."
              : "Not enough owned asset for this sale."}
          </p>
          <dl className="funds-details">
            <dt>Available Demo USD</dt>
            <dd>{delivery.funds.availableCash}</dd>
            <dt>Available {delivery.funds.symbol}</dt>
            <dd>{delivery.funds.availableAsset}</dd>
            <dt>Maximum {delivery.funds.side} quantity</dt>
            <dd>
              {delivery.funds.maxQuantity} {delivery.funds.symbol}
            </dd>
            <dt>Your requested quantity</dt>
            <dd>
              {delivery.funds.requestedQuantity} {delivery.funds.symbol}
            </dd>
          </dl>
          <p className="field-help">
            These are the service's current limits after reserved funds. Check
            your quantity or collect available generator resources.
          </p>
          <button className="primary" autoFocus onClick={delivery.dismissFunds}>
            Review order
          </button>
        </Modal>
      )}
      {sessionNotice && (
        <Modal
          title="Signed in on another device"
          onCancel={dismissSessionNotice}
        >
          <p>{sessionNotice}</p>
          <p>Sign in again when you want to play on this device.</p>
          <button className="primary" autoFocus onClick={dismissSessionNotice}>
            OK
          </button>
        </Modal>
      )}
      {process.env.NODE_ENV !== "production" && (
        <details className="developer-tools">
          <summary>
            Developer tools · fake accounts and simulated devices
          </summary>
          <p>
            Fake credentials: <code>learner / 0073</code>,{" "}
            <code>trader / 0042</code>, <code>visitor / 0000</code>. These are
            not real accounts.
          </p>
          <div className="dev-links">
            {["A", "B", "C", "D"].map((d) => (
              <a
                key={d}
                href={`/?device=${d}`}
                target="_blank"
                rel="noreferrer"
              >
                Open device {d}
              </a>
            ))}
          </div>
          <p>
            Each link opens a separate simulated device. Real hardware identity
            is not verified by this prototype.
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              const generation = context.current.generation;
              setBusy(true);
              try {
                await api.reset();
                if (context.current.generation === generation) {
                  for (const id of [
                    "demo-learner",
                    "demo-trader",
                    "demo-visitor",
                  ])
                    writeStorage(`cot.demo.pending.${id}`, null);
                  clearSession("Demo data reset. Sign in with a fake account.");
                }
              } catch {
                if (context.current.generation === generation)
                  setMessage("Unable to reset demo data.");
              } finally {
                if (context.current.generation === generation) setBusy(false);
              }
            }}
          >
            Reset demo data
          </button>
          <p>
            Reset clears all temporary sessions and restores fake fixtures. It
            is not an in-game funding reward.
          </p>
          {view?.lesson?.status === "active" && (
            <div className="action-row">
              <button
                disabled={busy || delivery.sending}
                onClick={() => void advanceLesson(20)}
              >
                Advance lesson 20s
              </button>
              <button
                disabled={busy || delivery.sending}
                onClick={() => void advanceLesson(60)}
              >
                Advance lesson 60s
              </button>
              <button
                disabled={busy || delivery.sending}
                onClick={() => void advanceLesson(180)}
              >
                Finish lesson clock
              </button>
              <p>
                Testing only: this advances the lesson, never resource
                production or real time.
              </p>
            </div>
          )}
          {view && (
            <div className="action-row">
              <button
                disabled={busy || delivery.sending}
                onClick={() => void advanceResources(1)}
              >
                Advance resources 1h
              </button>
              <button
                disabled={busy || delivery.sending}
                onClick={() => void advanceResources(60)}
              >
                Advance resources 60h
              </button>
              <p>
                Testing only: advances the resource clock, never the lesson
                clock.
              </p>
            </div>
          )}
          {view && (
            <div className="action-row">
              <button
                disabled={busy || delivery.sending}
                onClick={() => void advanceWorld(12)}
              >
                Advance world 12h
              </button>
              <button
                disabled={busy || delivery.sending}
                onClick={() => void advanceWorld(48)}
              >
                Advance world 48h
              </button>
              <p>
                Testing only: advances all server clocks, including
                construction, conversion cooldown and active deadlines. It does
                not grant money.
              </p>
            </div>
          )}
          {view && (
            <pre>
              {JSON.stringify(
                {
                  mode: view.mode,
                  revision: view.revision,
                  devices: view.devices,
                },
                null,
                2,
              )}
            </pre>
          )}
        </details>
      )}
    </>
  );
}
