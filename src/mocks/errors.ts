import type { FundsDetails } from "../api/market-types.ts";
export class DemoError extends Error {
  code: string;
  status: number;
  details?: FundsDetails;
  constructor(
    code: string,
    message: string,
    status = errorStatus(code),
    details?: FundsDetails,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const statuses: Record<string, number> = {
  STORE_UNAVAILABLE: 503,
  POLICY_INVALID: 503,
  POLICY_UNAVAILABLE: 503,
  POLICY_CHANGED: 409,
  PRICE_UNAVAILABLE: 503,
  ACTIVE_DEMONSTRATION: 409,
  DESTINATION_STORAGE_FULL: 409,
  CONVERTER_LOCKED: 409,
  CONVERSION_COOLDOWN: 409,
  INVALID_CONVERSION: 409,
  AMOUNT_TOO_SMALL: 409,
  UPGRADE_LOCKED: 409,
  CONSTRUCTION_SLOTS_FULL: 409,
  CONSTRUCTION_EXISTS: 409,
  CONSTRUCTION_COMPLETED: 409,
  INVALID_PAYMENT_ASSET: 409,
  INVALID_QUOTE: 409,
  QUOTE_NOT_FOUND: 409,
  QUOTE_EXPIRED: 409,
  QUOTE_USED: 409,
  ACKNOWLEDGEMENT_REQUIRED: 409,
  NOTHING_TO_CLAIM: 409,
  QUESTION_LOCKED: 409,
  QUESTION_STALE: 409,
  INVALID_ANSWER: 409,
  ASSISTANCE_UNAVAILABLE: 409,
  OFFER_EXPIRED: 409,
  LESSON_LOCKED: 409,
  ACTIVE_ORDER_EXISTS: 409,
  FEATURE_NOT_CONFIGURED: 409,
  NOTHING_TO_COLLECT: 409,
  INVALID_COMMAND: 400,
  INSUFFICIENT_AVAILABLE_FUNDS: 409,
  SESSION_COMPLETED: 409,
  NOT_FOUND: 404,
  ACTIVE_SESSION_EXISTS: 409,
  IDEMPOTENCY_KEY_CONFLICT: 409,
  FAST_FORWARD_NOT_READY: 409,
  INVALID_USERNAME: 400,
  INVALID_PIN: 400,
  INVALID_DEVICE: 400,
  INVALID_CREDENTIALS: 401,
  SESSION_REPLACED: 401,
  SESSION_REMOVED: 401,
  UNAUTHENTICATED: 401,
  BODY_TOO_LARGE: 413,
  INVALID_REQUEST: 400,
};

// The temporary store can outlive a hot-reloaded error constructor. Validate
// its public failure shape instead of depending on constructor identity.
export function isDemoError(error: unknown): error is DemoError {
  if (!error || Object.prototype.toString.call(error) !== "[object Error]")
    return false;
  const value = error as DemoError & { devices?: unknown };
  if (
    typeof value.code !== "string" ||
    !Object.hasOwn(statuses, value.code) ||
    value.status !== statuses[value.code] ||
    typeof value.message !== "string" ||
    !value.message.length ||
    value.message.length > 256 ||
    value.devices !== undefined ||
    (value.details !== undefined &&
      (value.code !== "INSUFFICIENT_AVAILABLE_FUNDS" ||
        !isFundsDetails(value.details)))
  )
    return false;
  return true;
}

function isFundsDetails(value: unknown): value is FundsDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const d = value as Record<string, unknown>,
    keys = [
      "symbol",
      "side",
      "availableCash",
      "availableAsset",
      "maxQuantity",
      "referencePrice",
      "requiredCash",
      "requestedQuantity",
    ];
  return (
    Object.keys(d).length === keys.length &&
    keys.every((k) => Object.hasOwn(d, k)) &&
    ["ETC", "SOL", "BTC"].includes(d.symbol as string) &&
    ["buy", "sell"].includes(d.side as string) &&
    keys
      .slice(2)
      .every(
        (k) =>
          typeof d[k] === "string" &&
          (d[k] as string).length <= 32 &&
          /^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$/.test(d[k] as string),
      )
  );
}

export function errorStatus(code: string): number {
  return statuses[code] ?? 400;
}
