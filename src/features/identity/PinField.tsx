"use client";

import { useState } from "react";
import { pinError } from "@/shared/validation";

export default function PinField({
  value,
  onChange,
  showError,
}: {
  value: string;
  onChange: (value: string) => void;
  showError: boolean;
}) {
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const error = attemptError || (showError ? pinError(value) : null);

  function rejectCharacters(text: string): boolean {
    if (!/[^0-9]/.test(text)) return false;
    setAttemptError("Only numbers from 0 to 9 are allowed.");
    return true;
  }

  return (
    <>
      <label htmlFor="pin">Four-digit PIN</label>
      <input
        id="pin"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        maxLength={4}
        pattern="[0-9]{4}"
        value={value}
        onKeyDown={(event) => {
          if (
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            event.key.length === 1 &&
            rejectCharacters(event.key)
          )
            event.preventDefault();
        }}
        onBeforeInput={(event) => {
          const text = (event.nativeEvent as InputEvent).data;
          if (text && rejectCharacters(text)) event.preventDefault();
        }}
        onPaste={(event) => {
          if (rejectCharacters(event.clipboardData.getData("text/plain")))
            event.preventDefault();
        }}
        onChange={(event) => {
          const next = event.target.value;
          if (rejectCharacters(next)) return;
          setAttemptError(null);
          onChange(next.slice(0, 4));
        }}
        aria-invalid={Boolean(error)}
        aria-describedby="pin-help"
        placeholder="••••"
      />
      <p
        id="pin-help"
        className={error ? "field-error" : "field-help"}
        role={error ? "alert" : undefined}
      >
        {error || "Leading zeros are part of your PIN."}
      </p>
    </>
  );
}
