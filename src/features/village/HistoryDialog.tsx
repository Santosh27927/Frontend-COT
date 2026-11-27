"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { EconomyState } from "@/api/economy-types";
export type HistoryPage = {
  items: EconomyState["history"];
  nextCursor: string | null;
};

export default function HistoryDialog({
  loadHistory,
  onClose,
}: {
  loadHistory: (cursor?: string) => Promise<HistoryPage>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [items, setItems] = useState<EconomyState["history"]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  async function load(next?: string) {
    const requestEpoch = ++epoch.current;
    setLoading(true);
    setError("");
    try {
      const page = await loadHistory(next);
      if (epoch.current !== requestEpoch) return;
      setItems((previous) =>
        next
          ? [
              ...previous,
              ...page.items.filter(
                (item) => !previous.some((old) => old.id === item.id),
              ),
            ]
          : page.items,
      );
      setCursor(page.nextCursor);
      setLoaded(true);
    } catch (problem) {
      if (epoch.current === requestEpoch)
        setError(
          problem instanceof Error
            ? problem.message
            : "Activity could not be loaded. Retry when connected.",
        );
    } finally {
      if (epoch.current === requestEpoch) setLoading(false);
    }
  }
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    void load();
    return () => {
      epoch.current++;
      element?.close();
    };
    // loadHistory is stable for this owner; closing/unmounting invalidates in-flight pages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadHistory]);
  return (
    <dialog
      ref={dialog}
      className="economy-dialog history-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <span className="eyebrow">Your village record</span>
      <h2 id={titleId}>Activity history</h2>
      {items.length > 0 && (
        <ol className="activity-list">
          {items.map((item) => (
            <li key={item.id}>
              <p>{item.message}</p>
              <time dateTime={item.at}>
                {new Date(item.at).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      )}
      {loaded && !items.length && (
        <p className="empty-state">No village activity yet.</p>
      )}
      {loading && <p role="status">Loading activity…</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        {error ? (
          <button
            disabled={loading}
            onClick={() =>
              void load(loaded ? (cursor ?? undefined) : undefined)
            }
          >
            Retry activity
          </button>
        ) : (
          cursor && (
            <button disabled={loading} onClick={() => void load(cursor)}>
              Load earlier activity
            </button>
          )
        )}
        <button onClick={onClose} autoFocus>
          Close activity history
        </button>
      </div>
    </dialog>
  );
}
