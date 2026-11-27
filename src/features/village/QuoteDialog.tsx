"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { EconomyQuote } from "@/api/economy-types";

export default function QuoteDialog({
  quote,
  blocked,
  onConfirm,
  onClose,
}: {
  quote: EconomyQuote;
  blocked: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  const cancellation = quote.kind === "cancellation";
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="economy-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <span className="eyebrow">Review before confirming</span>
      <h2 id={titleId}>
        {quote.kind === "conversion"
          ? "Your conversion quote"
          : cancellation
            ? "Cancel construction?"
            : "Your upgrade quote"}
      </h2>
      <ul className="quote-lines">
        {quote.lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
      <p className="field-help">
        Quote expires at{" "}
        <time dateTime={quote.expiresAt}>
          {new Date(quote.expiresAt).toLocaleTimeString()}
        </time>
        . Nothing is paid until you confirm.
      </p>
      {cancellation && (
        <label className="acknowledgement">
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={blocked}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>{quote.confirmation}</span>
        </label>
      )}
      <div className="dialog-actions">
        <button
          className={cancellation ? "danger-action" : "primary"}
          disabled={blocked || (cancellation && !acknowledged)}
          onClick={() => void onConfirm()}
        >
          {cancellation ? "Confirm cancellation" : quote.confirmation}
        </button>
        <button onClick={onClose} autoFocus>
          Back without confirming
        </button>
      </div>
    </dialog>
  );
}
