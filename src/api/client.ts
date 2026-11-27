import type {
  EconomyQuote,
  EconomyState,
  QuoteRequest,
} from "./economy-types.ts";
import type {
  Command,
  Receipt,
  Report,
  OrderDraft,
  OrderPreview,
  FundsDetails,
} from "./market-types.ts";
import type { ErrorBody, PlayerState, SignInResult } from "./types.ts";
export class ApiError extends Error {
  code: string;
  status: number;
  details?: FundsDetails;
  constructor(body: ErrorBody, status = 400) {
    super(body.error.message);
    this.code = body.error.code;
    this.status = status;
    this.details = body.error.details;
  }
}
export function isSessionEnded(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    ["SESSION_REPLACED", "SESSION_REMOVED", "UNAUTHENTICATED"].includes(
      error.code,
    )
  );
}
export function isStateAtLeastAsNew(
  candidate: Pick<PlayerState, "revision" | "serverNow">,
  current: Pick<PlayerState, "revision" | "serverNow"> | null,
): boolean {
  return (
    !current ||
    candidate.revision > current.revision ||
    (candidate.revision === current.revision &&
      Date.parse(candidate.serverNow) >= Date.parse(current.serverNow))
  );
}
async function request<T>(
  action: string,
  method: "GET" | "POST",
  token?: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/mock/${action}`, {
    method,
    cache: "no-store",
    headers: {
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data, response.status);
  return data as T;
}
export const api = {
  signIn: (username: string, pin: string, deviceId: string) =>
    request<SignInResult>("sign-in", "POST", undefined, {
      username,
      pin,
      deviceId,
    }),
  state: (token: string) => request<PlayerState>("state", "GET", token),
  startLesson: (token: string, intentId: string) =>
    request<PlayerState>("start-lesson", "POST", token, { intentId }),
  command: (token: string, command: Command) =>
    request<{ state: PlayerState; receipt: Receipt; replayed: boolean }>(
      "command",
      "POST",
      token,
      command,
    ),
  preview: (token: string, draft: OrderDraft) =>
    request<{ state: PlayerState; preview: OrderPreview }>(
      "order-preview",
      "POST",
      token,
      draft,
    ),
  history: (token: string, cursor?: string) =>
    request<{ items: EconomyState["history"]; nextCursor: string | null }>(
      "history?limit=25" +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      "GET",
      token,
    ),
  quote: (token: string, input: QuoteRequest) =>
    request<{ quote: EconomyQuote; state: PlayerState }>(
      "quote",
      "POST",
      token,
      input,
    ),
  advanceWorld: (token: string, hours: number) =>
    request<PlayerState>("dev-world", "POST", token, { hours }),
  advanceResources: (token: string, hours: number) =>
    request<PlayerState>("dev-resources", "POST", token, { hours }),
  report: (token: string, attemptId: string) =>
    request<Report>(
      "report?attemptId=" + encodeURIComponent(attemptId),
      "GET",
      token,
    ),
  advance: (token: string, attemptId: string, seconds: number) =>
    request<PlayerState>("dev-advance", "POST", token, { attemptId, seconds }),
  signOut: (token: string) =>
    request<{ signedOut: true }>("sign-out", "POST", token),
  reset: () => request<{ reset: true }>("dev-reset", "POST"),
};
