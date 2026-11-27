import { getDemoStore, resetDemoStore } from "./store.ts";
import { DemoError, isDemoError } from "./errors.ts";
import { getPolicy, policyStatus } from "./policy/service.ts";
import { ASSET_RULES } from "./policy/catalog.ts";
import { encodeData } from "./persistence/codec.ts";

type Action =
  | "sign-in"
  | "state"
  | "sign-out"
  | "start-lesson"
  | "command"
  | "report"
  | "order-preview"
  | "quote"
  | "conversion-quote"
  | "upgrade-quote"
  | "cancellation-quote"
  | "catalog"
  | "wallet"
  | "economy"
  | "policy"
  | "history"
  | "dev-reset"
  | "dev-advance"
  | "dev-resources"
  | "dev-world"
  | "dev-export"
  | "dev-policy-migrate";
const reads = new Set<Action>([
  "state",
  "report",
  "catalog",
  "wallet",
  "economy",
  "policy",
  "history",
]);
const developers = new Set<Action>([
  "dev-reset",
  "dev-advance",
  "dev-resources",
  "dev-world",
  "dev-export",
  "dev-policy-migrate",
]);
const LIMIT = 8192;
function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
function token(request: Request): string {
  const value = request.headers.get("authorization") ?? "";
  if (!/^Bearer [a-f0-9-]{36}$/.test(value))
    throw new DemoError("UNAUTHENTICATED", "Sign in to continue.", 401);
  return value.slice(7);
}
function developmentAllowed(request: Request): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const url = new URL(request.url);
  const loopback = (hostname: string) =>
    ["127.0.0.1", "localhost", "[::1]"].includes(hostname);
  if (!loopback(url.hostname)) return false;
  // Next may canonicalize Request.url to localhost while the browser actually
  // requested 127.0.0.1. Host is the browser-facing authority; forwarded headers
  // are deliberately not trusted. Cross-origin aliases and other ports still fail.
  const host = request.headers.get("host");
  let authority = url;
  if (host) {
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(host))
      return false;
    try {
      authority = new URL(`${url.protocol}//${host}`);
    } catch {
      return false;
    }
    if (!loopback(authority.hostname)) return false;
  }
  const origin = request.headers.get("origin");
  if (!origin) return true; // Local CLI development helper, no browser Origin.
  try {
    const supplied = new URL(origin);
    return (
      supplied.origin === origin &&
      supplied.protocol === authority.protocol &&
      loopback(supplied.hostname) &&
      supplied.host === authority.host
    );
  } catch {
    return false;
  }
}
async function bodyObject(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > LIMIT)
    throw new DemoError("BODY_TOO_LARGE", "Request is too large.", 413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > LIMIT) {
        await reader.cancel();
        throw new DemoError("BODY_TOO_LARGE", "Request is too large.", 413);
      }
      chunks.push(value);
    }
  }
  let body: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new DemoError("INVALID_REQUEST", "Send a valid JSON object.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new DemoError("INVALID_REQUEST", "Send a valid JSON object.");
  return body as Record<string, unknown>;
}
function allowedFields(action: Action): string[] | null {
  if (action === "sign-in") return ["username", "pin", "deviceId"];
  if (action === "start-lesson") return ["intentId", "variantId"];
  if (action === "dev-advance") return ["attemptId", "seconds"];
  if (["dev-resources", "dev-world"].includes(action)) return ["hours"];
  if (action === "dev-policy-migrate")
    return ["expectedVersion", "acknowledged"];
  if (action === "conversion-quote") return ["from", "to"];
  if (action === "upgrade-quote") return ["upgradeId", "paymentAsset"];
  if (action === "cancellation-quote") return ["constructionId"];
  if (["command", "order-preview", "quote"].includes(action)) return null;
  return [];
}
export async function handleMockRequest(
  request: Request,
  action: Action,
): Promise<Response> {
  try {
    if (request.method !== (reads.has(action) ? "GET" : "POST"))
      return json(
        {
          error: { code: "METHOD_NOT_ALLOWED", message: "Unsupported method." },
        },
        405,
      );
    if (developers.has(action) && !developmentAllowed(request))
      return json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Developer tools are unavailable.",
          },
        },
        404,
      );
    const body = request.method === "POST" ? await bodyObject(request) : {};
    const allowed = allowedFields(action);
    if (allowed && Object.keys(body).some((key) => !allowed.includes(key)))
      throw new DemoError("INVALID_REQUEST", "Unexpected request fields.");
    // Reset remains possible for a damaged local disposable store; loading the
    // damaged file must never be a prerequisite for this explicit recovery action.
    if (action === "dev-reset") {
      resetDemoStore();
      return json({ reset: true });
    }
    const store = getDemoStore();
    if (action === "sign-in")
      return json(store.signIn(body.username, body.pin, body.deviceId));
    if (action === "dev-export")
      return new Response(encodeData(store.exportData()), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Content-Disposition": "attachment; filename=cot-demo-backup.json",
        },
      });
    const authenticatedToken = token(request);
    if (action === "state") return json(store.state(authenticatedToken));
    if (["catalog", "wallet", "economy", "policy"].includes(action)) {
      const state = store.state(authenticatedToken);
      if (action === "catalog")
        return json({
          assetRules: ASSET_RULES,
          course: state.course,
          buildings: state.economy.buildings,
        });
      if (action === "wallet")
        return json({
          wallet: state.economy.wallet,
          credits: state.economy.credits,
        });
      if (action === "economy") return json(state.economy);
      const policy = getPolicy();
      return json({
        ...policyStatus(),
        assetRules: ASSET_RULES,
        learning: policy.learning,
        walletCaps: policy.walletCaps,
        constructionSlots: policy.constructionSlots,
        production: policy.production,
        conversion: policy.conversion,
        construction: policy.construction,
        quiz: policy.quiz,
        assistance: policy.assistance,
      });
    }
    if (action === "start-lesson")
      return json(
        store.startLesson(authenticatedToken, body.intentId, body.variantId),
      );
    if (action === "order-preview")
      return json(store.preview(authenticatedToken, body));
    if (action === "quote") return json(store.quote(authenticatedToken, body));
    if (action === "conversion-quote")
      return json(
        store.quote(authenticatedToken, {
          kind: "conversion",
          source: body.from,
          destination: body.to,
        }),
      );
    if (action === "upgrade-quote")
      return json(
        store.quote(authenticatedToken, {
          kind: "upgrade",
          building: body.upgradeId,
          paymentAsset: body.paymentAsset,
        }),
      );
    if (action === "cancellation-quote")
      return json(
        store.quote(authenticatedToken, {
          kind: "cancellation",
          constructionId: body.constructionId,
        }),
      );
    if (action === "dev-resources")
      return json(store.advanceResources(authenticatedToken, body.hours));
    if (action === "dev-world")
      return json(store.advanceWorld(authenticatedToken, body.hours));
    if (action === "dev-policy-migrate")
      return json(
        store.migratePolicy(
          authenticatedToken,
          body.expectedVersion,
          body.acknowledged,
        ),
      );
    if (action === "command")
      return json(store.command(authenticatedToken, body));
    if (action === "dev-advance")
      return json(
        store.advance(authenticatedToken, body.attemptId, body.seconds),
      );
    if (action === "report") {
      const query = new URL(request.url).searchParams;
      if (
        [...query.keys()].some((key) => key !== "attemptId") ||
        query.getAll("attemptId").length !== 1
      )
        throw new DemoError("INVALID_REQUEST", "Choose one report.");
      return json(store.report(authenticatedToken, query.get("attemptId")));
    }
    if (action === "history") {
      const query = new URL(request.url).searchParams;
      if (
        [...query.keys()].some((key) => !["cursor", "limit"].includes(key)) ||
        query.getAll("cursor").length > 1 ||
        query.getAll("limit").length > 1
      )
        throw new DemoError(
          "INVALID_REQUEST",
          "Choose one history cursor and limit.",
        );
      return json(
        store.history(
          authenticatedToken,
          query.get("cursor") ?? undefined,
          query.has("limit") ? Number(query.get("limit")) : 25,
        ),
      );
    }
    store.signOut(authenticatedToken);
    return json({ signedOut: true });
  } catch (error) {
    if (isDemoError(error))
      return json(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
        },
        error.status,
      );
    return json(
      {
        error: {
          code: "DEMO_ERROR",
          message: "The demo service could not complete that action.",
        },
      },
      500,
    );
  }
}
