"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderDraft, OrderPreview } from "@/api/market-types";
import type { PlayerState } from "@/api/types";
export type LoadPreview = (
  draft: OrderDraft,
) => Promise<{ state: PlayerState; preview: OrderPreview }>;
export function useOrderPreview(
  draft: OrderDraft,
  revision: number,
  quoteKey: string,
  load: LoadPreview,
) {
  const [retryCount, setRetryCount] = useState(0);
  const retry = useCallback(() => {
    setError(null);
    setRetryCount((n) => n + 1);
  }, []);
  const inputKey = JSON.stringify(draft);
  const key = JSON.stringify([inputKey, revision, quoteKey, retryCount]),
    seq = useRef(0),
    [result, setResult] = useState<{
      key: string;
      revision: number;
      preview: OrderPreview;
    } | null>(null),
    [error, setError] = useState<{ key: string; message: string } | null>(null);
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("online", retry);
    window.addEventListener("offline", retry);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("offline", retry);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [retry]);
  useEffect(() => {
    const id = ++seq.current;
    const timer = setTimeout(() => {
      load(JSON.parse(inputKey))
        .then((r) => {
          if (seq.current === id) {
            setResult({ key, revision: r.state.revision, preview: r.preview });
            setError(null);
          }
        })
        .catch(() => {
          if (seq.current === id)
            setError({
              key,
              message:
                "Order limits are unavailable. Reconnect to check your current balance before trading.",
            });
        });
    }, 180);
    return () => {
      seq.current++;
      clearTimeout(timer);
    };
  }, [key, revision, quoteKey, load, retryCount]);
  return {
    preview:
      result?.key === key && result.revision >= revision
        ? result.preview
        : null,
    error: error?.key === key ? error.message : "",
    retry,
  };
}
