import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleMockRequest } from "../handler.ts";
import { resetDemoStore } from "../store.ts";
const directory = mkdtempSync(join(tmpdir(), "cot-durable-http-"));
process.env.COT_DEMO_DATA_DIR = directory;
after(() => rmSync(directory, { recursive: true, force: true }));
const origin = "http://localhost:3100";
async function call(
  action: Parameters<typeof handleMockRequest>[1],
  options: {
    body?: unknown;
    method?: string;
    token?: string;
    origin?: string;
    host?: string;
    query?: string;
  } = {},
) {
  const method =
    options.method ??
    (["state", "catalog", "wallet", "economy", "policy", "history"].includes(
      action,
    )
      ? "GET"
      : "POST");
  const request = new Request(
    `${options.host ?? origin}/api/mock/${action}${options.query ?? ""}`,
    {
      method,
      headers: {
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.origin ? { Origin: options.origin } : {}),
      },
      ...(method === "POST"
        ? { body: JSON.stringify(options.body ?? {}) }
        : {}),
    },
  );
  const response = await handleMockRequest(request, action);
  return {
    status: response.status,
    cache: response.headers.get("cache-control"),
    body: await response.json(),
  };
}
async function signIn() {
  return (
    await call("sign-in", {
      body: { username: "learner", pin: "0073", deviceId: "A" },
    })
  ).body.token as string;
}

test("HTTP durability: owned read projections require the current session and never contain credentials", async () => {
  resetDemoStore();
  const token = await signIn();
  for (const action of [
    "catalog",
    "wallet",
    "economy",
    "policy",
    "history",
  ] as const) {
    assert.equal((await call(action)).status, 401);
    const response = await call(action, { token });
    assert.equal(response.status, 200);
    assert.equal(response.cache, "no-store");
    const text = JSON.stringify(response.body);
    assert.equal(text.includes('"pin"'), false);
    assert.equal(text.includes('"tokens"'), false);
    assert.equal(text.includes('"correct":'), false);
  }
});

test("HTTP durability: development mutations reject cross-origin, remote-host and production requests", async () => {
  const token = await signIn();
  for (const action of [
    "dev-reset",
    "dev-world",
    "dev-resources",
    "dev-advance",
    "dev-export",
    "dev-policy-migrate",
  ] as const) {
    assert.equal(
      (await call(action, { token, origin: "https://outside.example" })).status,
      404,
    );
    assert.equal(
      (await call(action, { token, host: "https://outside.example" })).status,
      404,
    );
  }
  const old = process.env.NODE_ENV;
  Object.defineProperty(process.env, "NODE_ENV", {
    value: "production",
    writable: true,
    enumerable: true,
    configurable: true,
  });
  try {
    assert.equal((await call("dev-reset")).status, 404);
  } finally {
    if (old === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else
      Object.defineProperty(process.env, "NODE_ENV", {
        value: old,
        writable: true,
        enumerable: true,
        configurable: true,
      });
  }
});

test("HTTP durability: quote adapters are read-only financial previews and reject forged amounts", async () => {
  resetDemoStore();
  const token = await signIn();
  const before = (await call("state", { token })).body;
  const forged = await call("conversion-quote", {
    token,
    body: { from: "USD", to: "BTC", amount: "1" },
  });
  assert.equal(forged.status, 400);
  assert.equal(forged.body.error.code, "INVALID_REQUEST");
  assert.equal(
    (
      await call("conversion-quote", {
        token,
        body: { from: "USD", to: "BTC" },
      })
    ).body.error.code,
    "CONVERTER_LOCKED",
  );
  assert.equal(
    (
      await call("upgrade-quote", {
        token,
        body: { upgradeId: "town-hall", paymentAsset: "USD" },
      })
    ).body.error.code,
    "UPGRADE_LOCKED",
  );
  assert.equal(
    (
      await call("cancellation-quote", {
        token,
        body: { constructionId: "foreign-id" },
      })
    ).body.error.code,
    "NOT_FOUND",
  );
  assert.equal((await call("state", { token })).body.demoUsd, before.demoUsd);
});

test("HTTP durability: byte limit rejects Unicode oversized requests, malformed JSON and unsupported methods", async () => {
  const response = await handleMockRequest(
    new Request(origin + "/api/mock/sign-in", {
      method: "POST",
      body: JSON.stringify({ value: "é".repeat(5000) }),
    }),
    "sign-in",
  );
  assert.equal(response.status, 413);
  const malformed = await handleMockRequest(
    new Request(origin + "/api/mock/sign-in", { method: "POST", body: "[" }),
    "sign-in",
  );
  assert.equal(malformed.status, 400);
  assert.equal((await call("state", { method: "POST" })).status, 405);
});

test("HTTP durability: explicit development reset archives a damaged snapshot instead of requiring it to load", async () => {
  resetDemoStore();
  await signIn();
  const path = join(directory, "players-v5.json");
  writeFileSync(path, "damaged-backup-test");
  const reset = await call("dev-reset");
  assert.equal(reset.status, 200);
  const archived = readdirSync(directory).find(
    (name) =>
      name.startsWith("players-v5.json.reset-") &&
      readFileSync(join(directory, name), "utf8") === "damaged-backup-test",
  );
  assert.ok(archived);
  assert.equal(
    (await call("state", { token: await signIn() })).body.demoUsd,
    "1000.00",
  );
});

test("HTTP durability: history cursor/limit and production migration acknowledgement are service validated", async () => {
  const token = await signIn();
  assert.equal(
    (await call("history", { token, query: "?limit=0" })).status,
    400,
  );
  assert.equal(
    (await call("history", { token, query: "?limit=1&limit=2" })).status,
    400,
  );
  assert.equal(
    (
      await call("history", {
        token,
        query: "?cursor=00000000-0000-0000-0000-000000000000",
      })
    ).status,
    400,
  );
  const policy = (await call("policy", { token })).body;
  assert.equal(
    (
      await call("dev-policy-migrate", {
        token,
        body: { expectedVersion: policy.version, acknowledged: false },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("dev-policy-migrate", {
        token,
        body: { expectedVersion: "stale", acknowledged: true },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("dev-policy-migrate", {
        token,
        body: { expectedVersion: policy.version, acknowledged: true },
      })
    ).status,
    200,
  );
});

test("HTTP durability: canonical localhost URL accepts the browser's matching loopback Host/Origin only", async () => {
  resetDemoStore();
  const token = await signIn();
  const request = (origin: string, host: string) =>
    new Request("http://localhost:3100/api/mock/dev-world", {
      method: "POST",
      headers: { Host: host, Origin: origin, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hours: 1 }),
    });
  assert.equal(
    (
      await handleMockRequest(
        request("http://127.0.0.1:3100", "127.0.0.1:3100"),
        "dev-world",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await handleMockRequest(
        request("http://localhost:3100", "127.0.0.1:3100"),
        "dev-world",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await handleMockRequest(
        request("http://127.0.0.1:3200", "127.0.0.1:3100"),
        "dev-world",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await handleMockRequest(
        request("https://outside.example", "outside.example"),
        "dev-world",
      )
    ).status,
    404,
  );
});
