import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";
const httpDataDir = mkdtempSync(join(tmpdir(), "cot-http-regression-"));
process.env.COT_DEMO_DATA_DIR = httpDataDir;
after(() => rmSync(httpDataDir, { recursive: true, force: true }));
import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoError, DemoStore, resetDemoStore } from "./store.ts";
import { usernameError, pinError } from "../shared/validation.ts";
import { isStateAtLeastAsNew } from "../api/client.ts";
import { handleMockRequest } from "./handler.ts";

function rejects(action: () => unknown, code: string) {
  assert.throws(
    action,
    (error) => error instanceof DemoError && error.code === code,
  );
}
function active(store: DemoStore, token: string) {
  const value = store.state(token);
  assert.equal(value.mode, "active");
  if (value.mode !== "active") throw new Error("Expected active player");
  return value;
}

test("P1: accepts supported lowercase boundaries and ASCII PIN strings including leading zeros", () => {
  for (const name of ["a", "z", "abcdefghij", "learner"])
    assert.equal(usernameError(name), null);
  for (const pin of ["0000", "0073", "9999"]) assert.equal(pinError(pin), null);
  assert.equal(pinError("1a23"), "Only numbers from 0 to 9 are allowed.");
  const store = new DemoStore();
  assert.equal(store.signIn("visitor", "0000", "A").state.username, "visitor");
});

test("P1: rejects invalid names/PIN types without normalization or account creation", () => {
  const store = new DemoStore();
  for (const name of [
    "",
    "Learner",
    "learn3r",
    "learn_er",
    "learn-er",
    "a b",
    " learner",
    "é",
    "abcdefghijk",
    "abcdefghijkl",
    null,
    1,
  ]) {
    assert.notEqual(usernameError(name), null);
    rejects(() => store.signIn(name, "0073", "A"), "INVALID_USERNAME");
  }
  for (const pin of [
    "123",
    "12345",
    " 073",
    "１２３４",
    "abcd",
    73,
    1234,
    null,
  ]) {
    assert.notEqual(pinError(pin), null);
    rejects(() => store.signIn("learner", pin, "A"), "INVALID_PIN");
  }
  rejects(() => store.signIn("missing", "0073", "A"), "INVALID_CREDENTIALS");
});

test("P6: monotonic response selection rejects old active state and backwards time at unchanged revision", () => {
  const current = { revision: 3, serverNow: "2026-11-24T12:00:10.000Z" };
  assert.equal(
    isStateAtLeastAsNew(
      { revision: 2, serverNow: "2026-11-24T12:00:20.000Z" },
      current,
    ),
    false,
  );
  assert.equal(
    isStateAtLeastAsNew(
      { revision: 3, serverNow: "2026-11-24T12:00:09.000Z" },
      current,
    ),
    false,
  );
  assert.equal(
    isStateAtLeastAsNew(
      { revision: 3, serverNow: "2026-11-24T12:00:11.000Z" },
      current,
    ),
    true,
  );
  assert.equal(
    isStateAtLeastAsNew({ revision: 4, serverNow: current.serverNow }, current),
    true,
  );
});

test("P4/P8 HTTP: reject malformed bodies, forged identity/roles, missing tokens and unsupported methods", async () => {
  resetDemoStore();
  const post = (body: unknown) =>
    new Request("http://localhost/api/mock/sign-in", {
      method: "POST",
      body: JSON.stringify(body),
    });
  for (const body of [
    null,
    [],
    1,
    {
      username: "learner",
      pin: "0073",
      deviceId: "A",
      playerId: "demo-trader",
    },
    { username: "learner", pin: "0073", deviceId: "A", role: "operator" },
  ]) {
    assert.equal((await handleMockRequest(post(body), "sign-in")).status, 400);
  }
  assert.equal(
    (
      await handleMockRequest(
        new Request("http://localhost/api/mock/state"),
        "state",
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handleMockRequest(
        new Request("http://localhost/api/mock/state", { method: "POST" }),
        "state",
      )
    ).status,
    405,
  );
  const valid = await handleMockRequest(
    post({ username: "learner", pin: "0073", deviceId: "A" }),
    "sign-in",
  );
  assert.equal(valid.status, 200);
  const login = await valid.json();
  const own = await handleMockRequest(
    new Request("http://localhost/api/mock/state?playerId=demo-trader", {
      headers: { Authorization: `Bearer ${login.token}` },
    }),
    "state",
  );
  assert.equal((await own.json()).playerId, "demo-learner");
  const wrongBody = new Request("http://localhost/api/mock/start-lesson", {
    method: "POST",
    headers: { Authorization: `Bearer ${login.token}` },
    body: "{bad",
  });
  assert.equal(
    (await handleMockRequest(wrongBody, "start-lesson")).status,
    400,
  );
  const tooLarge = new Request("http://localhost/api/mock/sign-in", {
    method: "POST",
    body: "x".repeat(8193),
  });
  assert.equal((await handleMockRequest(tooLarge, "sign-in")).status, 413);
});

test("P8: developer reset route is unavailable in production mode", async () => {
  const env = process.env as Record<string, string | undefined>;
  const before = env.NODE_ENV;
  try {
    env.NODE_ENV = "production";
    assert.equal(
      (
        await handleMockRequest(
          new Request("http://localhost/api/mock/dev-reset", {
            method: "POST",
          }),
          "dev-reset",
        )
      ).status,
      404,
    );
  } finally {
    if (before === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = before;
  }
});

test("P10: unexpected and malformed exceptions stay generic without leaking private fields", async () => {
  const globals = globalThis as typeof globalThis & {
    __cotDemoStore?: DemoStore;
  };
  const previous = globals.__cotDemoStore;
  const store = new DemoStore();
  const safeDevice = { id: "A", label: "Device A", active: true };
  const shaped = (extra: Record<string, unknown>) =>
    Object.assign(new Error("private diagnostic"), extra);
  const bad = [
    new Error("private diagnostic"),
    shaped({ code: "UNKNOWN", status: 400 }),
    shaped({ code: "DEVICE_LIMIT", status: 409 }),
    { code: "INVALID_PIN", status: 400, message: "private diagnostic" },
    shaped({ code: "INVALID_PIN", status: 403 }),
    shaped({ code: "INVALID_PIN", status: 400, devices: [safeDevice] }),
    shaped({
      code: "SESSION_REPLACED",
      status: 401,
      devices: [{ ...safeDevice, token: "private-token" }],
    }),
    shaped({
      code: "SESSION_REPLACED",
      status: 401,
      devices: [{ ...safeDevice, active: "yes" }],
    }),
    shaped({
      code: "SESSION_REPLACED",
      status: 401,
      devices: Array(4).fill(safeDevice),
    }),
    Object.assign(new Error("x".repeat(257)), {
      code: "INVALID_PIN",
      status: 400,
    }),
  ];
  globals.__cotDemoStore = store;
  try {
    for (const failure of bad) {
      store.signIn = () => {
        throw failure;
      };
      const result = await handleMockRequest(
        new Request("http://localhost/api/mock/sign-in", {
          method: "POST",
          body: JSON.stringify({
            username: "learner",
            pin: "0073",
            deviceId: "A",
          }),
        }),
        "sign-in",
      );
      assert.equal(result.status, 500);
      assert.deepEqual(await result.json(), {
        error: {
          code: "DEMO_ERROR",
          message: "The demo service could not complete that action.",
        },
      });
    }
  } finally {
    if (previous) globals.__cotDemoStore = previous;
    else delete globals.__cotDemoStore;
  }
});

test("P2/P3: each successful device login revokes the sole prior token on every protected action", () => {
  const store = new DemoStore();
  let current = store.signIn("learner", "0073", "A");
  for (const device of ["B", "C", "D", "A"]) {
    const old = current.token;
    current = store.signIn("learner", "0073", device);
    assert.deepEqual(
      current.state.devices.map((d) => d.id),
      [device],
    );
    for (const action of [
      () => store.state(old),
      () => store.startLesson(old),
      () => store.signOut(old),
    ])
      rejects(action, "SESSION_REPLACED");
    assert.equal(active(store, current.token).devices.length, 1);
  }
});
test("P2/P3: same-device rotation, logout and unknown tokens use ordinary ended-session errors", () => {
  const store = new DemoStore();
  const first = store.signIn("learner", "0073", "A");
  const second = store.signIn("learner", "0073", "A");
  assert.notEqual(first.token, second.token);
  rejects(() => store.state(first.token), "SESSION_REMOVED");
  rejects(() => store.signOut(first.token), "SESSION_REMOVED");
  assert.equal(store.state(second.token).mode, "active");
  store.signOut(second.token);
  rejects(() => store.state(second.token), "SESSION_REMOVED");
  rejects(() => store.state("unknown"), "SESSION_REMOVED");
});
test("P2/P4: incorrect credentials leave the current session and independent accounts unchanged", () => {
  const store = new DemoStore(() => 10000);
  const a = store.signIn("learner", "0073", "A");
  const before = store.state(a.token);
  rejects(() => store.signIn("learner", "9999", "B"), "INVALID_CREDENTIALS");
  rejects(() => store.signIn("learner", "abcd", "B"), "INVALID_PIN");
  rejects(() => store.signIn("Learner", "0073", "B"), "INVALID_USERNAME");
  assert.deepEqual(store.state(a.token), before);
  const other = store.signIn("trader", "0042", "X");
  assert.equal(store.state(a.token).mode, "active");
  assert.equal(active(store, other.token).playerId, "demo-trader");
  assert.equal(active(store, other.token).lesson, null);
});
test("P5: a new current device resumes the same lesson/deadline without refilling or expiry credit", () => {
  let now = 10000;
  const store = new DemoStore(() => now);
  const a = store.signIn("learner", "0073", "A");
  const first = store.startLesson(a.token, "initial-start");
  now += 60000;
  const b = store.signIn("learner", "0073", "B");
  const resumed = store.startLesson(b.token, "resumed-start");
  assert.equal(resumed.lesson?.id, first.lesson?.id);
  assert.equal(resumed.lesson?.expiresAt, first.lesson?.expiresAt);
  assert.equal(resumed.lesson?.remainingSeconds, 120);
  assert.equal(resumed.demoUsd, "1000.00");
  rejects(() => store.startLesson(a.token), "SESSION_REPLACED");
  now = Date.parse(first.lesson!.expiresAt);
  const ended = active(store, b.token);
  assert.equal(ended.lesson?.status, "ended");
  assert.equal(ended.lesson?.remainingSeconds, 0);
  assert.equal(ended.lesson?.assessment, "not-passed");
  assert.equal(ended.completedScenarios, 0);
  const next = store.startLesson(b.token, "next-start");
  assert.notEqual(next.lesson?.id, first.lesson?.id);
  assert.equal(next.demoUsd, "1000.00");
});
test("P3/P4 HTTP: revoked tokens cannot read/start/sign out current session, and legacy replacement fields are rejected", async () => {
  resetDemoStore();
  const post = (body: unknown) =>
    new Request("http://localhost/api/mock/sign-in", {
      method: "POST",
      body: JSON.stringify(body),
    });
  const first = await handleMockRequest(
    post({ username: "learner", pin: "0073", deviceId: "A" }),
    "sign-in",
  );
  const a = await first.json();
  const legacy = await handleMockRequest(
    post({
      username: "learner",
      pin: "0073",
      deviceId: "B",
      replaceDeviceId: "A",
    }),
    "sign-in",
  );
  assert.equal(legacy.status, 400);
  const read = (token: string) =>
    new Request("http://localhost/api/mock/state", {
      headers: { Authorization: `Bearer ${token}` },
    });
  assert.equal((await handleMockRequest(read(a.token), "state")).status, 200);
  const second = await handleMockRequest(
    post({ username: "learner", pin: "0073", deviceId: "B" }),
    "sign-in",
  );
  const b = await second.json();
  for (const action of ["state", "start-lesson", "sign-out"] as const) {
    const result = await handleMockRequest(
      new Request(`http://localhost/api/mock/${action}`, {
        method: action === "state" ? "GET" : "POST",
        headers: { Authorization: `Bearer ${a.token}` },
      }),
      action,
    );
    assert.equal(result.status, 401);
    assert.deepEqual(await result.json(), {
      error: {
        code: "SESSION_REPLACED",
        message: "You have signed in on another device.",
      },
    });
  }
  assert.equal((await handleMockRequest(read(b.token), "state")).status, 200);
  resetDemoStore();
  const reset = await handleMockRequest(read(b.token), "state");
  assert.equal((await reset.json()).error.code, "SESSION_REMOVED");
});
test("P10: independent error class preserves credential and session-replacement failures without resetting the lesson", async () => {
  const url = new URL("./errors.ts", import.meta.url);
  url.searchParams.set("revision", "independent-session-module");
  const { DemoError: ReloadedError } = await import(url.href);
  assert.equal(
    new ReloadedError(
      "SESSION_REPLACED",
      "You have signed in on another device.",
      401,
    ) instanceof DemoError,
    false,
  );
  const globals = globalThis as typeof globalThis & {
    __cotDemoStore?: DemoStore;
  };
  const previous = globals.__cotDemoStore;
  const store = new DemoStore();
  const a = store.signIn("learner", "0073", "A");
  const lesson = store.startLesson(a.token, "initial-start");
  const b = store.signIn("learner", "0073", "B");
  const signIn = store.signIn.bind(store),
    state = store.state.bind(store);
  const rethrow = (error: unknown): never => {
    if (error instanceof DemoError)
      throw new ReloadedError(error.code, error.message, error.status);
    throw error;
  };
  store.signIn = (...args) => {
    try {
      return signIn(...args);
    } catch (error) {
      return rethrow(error);
    }
  };
  store.state = (token) => {
    try {
      return state(token);
    } catch (error) {
      return rethrow(error);
    }
  };
  globals.__cotDemoStore = store;
  try {
    for (const [pin, status, code] of [
      ["9999", 401, "INVALID_CREDENTIALS"],
      ["ab!1", 400, "INVALID_PIN"],
    ] as const) {
      const result = await handleMockRequest(
        new Request("http://localhost/api/mock/sign-in", {
          method: "POST",
          body: JSON.stringify({ username: "learner", pin, deviceId: "C" }),
        }),
        "sign-in",
      );
      assert.equal(result.status, status);
      assert.equal((await result.json()).error.code, code);
    }
    const revoked = await handleMockRequest(
      new Request("http://localhost/api/mock/state", {
        headers: { Authorization: `Bearer ${a.token}` },
      }),
      "state",
    );
    assert.equal(revoked.status, 401);
    assert.equal((await revoked.json()).error.code, "SESSION_REPLACED");
    assert.equal(active(store, b.token).lesson?.id, lesson.lesson?.id);
    assert.equal(active(store, b.token).demoUsd, "1000.00");
  } finally {
    if (previous) globals.__cotDemoStore = previous;
    else delete globals.__cotDemoStore;
  }
});
