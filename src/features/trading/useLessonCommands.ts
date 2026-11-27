"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, isSessionEnded } from "@/api/client";
import type { Command, Receipt, FundsDetails } from "@/api/market-types";
export type CommandInput = Command extends infer C
  ? C extends Command
    ? Omit<C, "intentId">
    : never
  : never;
export function useLessonCommands(
  owner: string | null,
  confirmed: string[],
  submit: (command: Command) => Promise<{ receipt: Receipt }>,
) {
  const offlineMessage =
    "You are offline. Reconnect before starting a new action. No new command was saved or sent.";
  const [online, setOnline] = useState(true);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const [pending, setPending] = useState<Command | null>(null),
    [sending, setSending] = useState(false),
    [message, setMessage] = useState("");
  const [funds, setFunds] = useState<FundsDetails | null>(null);
  const current = useRef<{
    owner: string | null;
    pending: Command | null;
    epoch: number;
    sending: boolean;
  }>({ owner: null, pending: null, epoch: 0, sending: false });
  const storageKey = (id: string) => `cot.demo.pending.${id}`;
  useEffect(() => {
    const update = () => {
      const connected = navigator.onLine;
      setOnline(connected);
      if (connected)
        setMessage((previous) => (previous === offlineMessage ? "" : previous));
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    const epoch = current.current.epoch + 1;
    let recovered: Command | null = null,
      problem = "";
    if (owner) {
      try {
        const raw = sessionStorage.getItem(storageKey(owner));
        if (raw) {
          const value = JSON.parse(raw);
          if (
            !value ||
            ![
              "start",
              "order",
              "finish",
              "cancel",
              "collect",
              "convert",
              "upgrade",
              "cancel-upgrade",
              "claim-credit",
              "answer",
              "claim-assistance",
            ].includes(value.action) ||
            typeof value.intentId !== "string"
          )
            throw new Error();
          recovered = value;
        }
      } catch {
        problem =
          "Command recovery storage is unavailable. Enable session storage or reset the temporary demo before trading.";
      }
    }
    current.current = { owner, pending: recovered, epoch, sending: false };
    setPending(recovered);
    setSending(false);
    setMessage(problem);
    setFunds(null);
    setLoadedOwner(problem ? null : owner);
    return () => {
      current.current.epoch++;
    };
  }, [owner]);
  const clear = useCallback((id: string, epoch: number) => {
    const c = current.current;
    if (c.epoch !== epoch || c.pending?.intentId !== id || !c.owner) return;
    try {
      const raw = sessionStorage.getItem(storageKey(c.owner));
      if (raw && JSON.parse(raw).intentId === id)
        sessionStorage.removeItem(storageKey(c.owner));
    } catch {
      return;
    } // Keep recovery blocked if its removal cannot be confirmed.
    c.pending = null;
    setPending(null);
  }, []);
  useEffect(() => {
    const c = current.current;
    if (
      c.owner === owner &&
      c.pending &&
      confirmed.includes(c.pending.intentId)
    ) {
      clear(c.pending.intentId, c.epoch);
      setMessage("Command confirmed by the demo service.");
    }
  }, [confirmed, owner, clear]);
  const deliver = useCallback(
    async (command: Command) => {
      const c = current.current,
        epoch = c.epoch;
      if (!c.owner || c.sending) return false;
      c.sending = true;
      setSending(true);
      setMessage("");
      setFunds(null);
      try {
        const response = await submit(command);
        if (current.current.epoch !== epoch) return false;
        clear(command.intentId, epoch);
        setMessage(response.receipt.message);
        return true;
      } catch (error) {
        if (current.current.epoch !== epoch) return false;
        if (isSessionEnded(error)) return false;
        if (
          error instanceof ApiError &&
          error.status < 500 &&
          error.code !== "IDEMPOTENCY_KEY_CONFLICT"
        ) {
          clear(command.intentId, epoch);
          setMessage(error.message);
          if (error.code === "INSUFFICIENT_AVAILABLE_FUNDS" && error.details)
            setFunds(error.details);
        } else
          setMessage(
            "Delivery is unconfirmed. Your original command is saved. Retry it before making another trade.",
          );
        return false;
      } finally {
        if (current.current.epoch === epoch) {
          current.current.sending = false;
          setSending(false);
        }
      }
    },
    [submit, clear],
  );
  const send = useCallback(
    async (input: CommandInput) => {
      const c = current.current;
      // This device-only check must precede UUID/storage. A request that was
      // already uncertain keeps its original intent and independent retry path.
      if (navigator.onLine === false) {
        setOnline(false);
        setMessage(offlineMessage);
        return false;
      }
      if (
        !owner ||
        c.owner !== owner ||
        loadedOwner !== owner ||
        c.pending ||
        c.sending
      )
        return false;
      const command = { ...input, intentId: crypto.randomUUID() } as Command;
      try {
        sessionStorage.setItem(storageKey(owner), JSON.stringify(command));
      } catch {
        setMessage(
          "Unable to save command recovery. Enable session storage before trading. Nothing was sent.",
        );
        return false;
      }
      c.pending = command;
      setPending(command);
      return deliver(command);
    },
    [owner, loadedOwner, deliver],
  );
  return {
    send,
    retry: () =>
      current.current.pending
        ? deliver(current.current.pending)
        : Promise.resolve(false),
    pending,
    sending,
    message,
    funds,
    dismissFunds: () => setFunds(null),
    ready: !!owner && loadedOwner === owner,
    editingBlocked: !!pending || sending || !owner || loadedOwner !== owner,
    blocked: !online || !!pending || sending || !owner || loadedOwner !== owner,
  };
}
