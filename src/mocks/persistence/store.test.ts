import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DemoStore, DemoError } from "../store.ts";
import { DurableFile, PersistenceError } from "./file.ts";
import { encodeData, decodeData } from "./codec.ts";

const rejected = (run: () => unknown, code: string) =>
  assert.throws(
    run,
    (error) => error instanceof DemoError && error.code === code,
  );
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "cot-durable-")),
    path = join(dir, "players.json");
  let now = Date.UTC(2026, 10, 25);
  const clock = () => now;
  const store = new DemoStore(clock, { path });
  return {
    dir,
    path,
    store,
    clock,
    tick: (seconds: number) => {
      now += seconds * 1000;
    },
    clean: () => rmSync(dir, { recursive: true, force: true }),
  };
}
function marketLesson(store: DemoStore, token: string, sequence: number) {
  const state = store.startLesson(token, `market-start-${sequence}`),
    lesson = state.lesson!;
  store.command(token, {
    action: "order",
    intentId: `market-buy-${sequence}`,
    attemptId: lesson.id,
    symbol: "ETC",
    side: "buy",
    quantity: "1",
  });
  store.command(token, {
    action: "order",
    intentId: `market-sell-${sequence}`,
    attemptId: lesson.id,
    symbol: "ETC",
    side: "sell",
    quantity: "1",
  });
  store.advance(token, lesson.id, 180);
}

test("durability: exact tagged values round-trip without Number coercion", () => {
  const data = {
    amount: 9223372036854775807n,
    credit: { n: 1n, d: 2n },
    map: new Map([["ETC", 100n]]),
    set: new Set(["accepted"]),
  };
  assert.deepEqual(decodeData(encodeData(data)), data);
  assert.throws(() => decodeData('{"$cot":"bigint","value":"1.1"}'));
});

test("durability: session, wallet, receipt and deadline survive service restart", () => {
  const f = fixture();
  try {
    const signed = f.store.signIn("learner", "0073", "A");
    const state = f.store.startLesson(signed.token, "start-restart-key"),
      lesson = state.lesson!;
    const command = {
      action: "order",
      intentId: "buy-restart-key",
      attemptId: lesson.id,
      symbol: "ETC",
      side: "buy",
      quantity: "1",
    };
    const accepted = f.store.command(signed.token, command);
    f.tick(45);
    const restarted = new DemoStore(f.clock, { path: f.path });
    const restored = restarted.state(signed.token);
    assert.equal(restored.lesson!.id, lesson.id);
    assert.equal(restored.lesson!.remainingSeconds, 135);
    assert.equal(restored.demoUsd, accepted.state.demoUsd);
    const replay = restarted.command(signed.token, command);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.receipt, accepted.receipt);
    assert.equal(replay.state.lesson!.orders.length, 1);
    rejected(
      () => restarted.command(signed.token, { ...command, quantity: "2" }),
      "IDEMPOTENCY_KEY_CONFLICT",
    );
    assert.equal(statSync(f.path).mode & 0o777, 0o600);
  } finally {
    f.clean();
  }
});

test("durability: replacement sign-in and logout survive restart without a new allocation", () => {
  const f = fixture();
  try {
    const a = f.store.signIn("learner", "0073", "A");
    const b = f.store.signIn("learner", "0073", "B");
    let restarted = new DemoStore(f.clock, { path: f.path });
    rejected(() => restarted.state(a.token), "SESSION_REPLACED");
    assert.equal(restarted.state(b.token).demoUsd, "1000.00");
    restarted.signOut(b.token);
    restarted = new DemoStore(f.clock, { path: f.path });
    rejected(() => restarted.state(b.token), "SESSION_REMOVED");
    assert.equal(
      restarted.signIn("learner", "0073", "A").state.demoUsd,
      "1000.00",
    );
  } finally {
    f.clean();
  }
});

test("durability: a failed save rolls back the fresh order and preserves the original intent for retry", () => {
  const f = fixture();
  try {
    const { token } = f.store.signIn("learner", "0073", "A");
    const lesson = f.store.startLesson(token, "save-start-key").lesson!;
    const command = {
      action: "order",
      intentId: "save-failure-buy",
      attemptId: lesson.id,
      symbol: "ETC",
      side: "buy",
      quantity: "1",
    };
    const original = readFileSync(f.path, "utf8");
    writeFileSync(f.path + ".lock", "other writer");
    rejected(() => f.store.command(token, command), "STORE_UNAVAILABLE");
    assert.equal(readFileSync(f.path, "utf8"), original);
    unlinkSync(f.path + ".lock");
    assert.equal(f.store.state(token).lesson!.orders.length, 0);
    assert.equal(f.store.command(token, command).replayed, false);
    assert.equal(f.store.command(token, command).replayed, true);
    assert.equal(f.store.state(token).lesson!.orders.length, 1);
  } finally {
    f.clean();
  }
});

test("durability: a due fill is saved independently before a new rejected manual action", () => {
  const f = fixture();
  try {
    const { token } = f.store.signIn("learner", "0073", "A");
    for (let i = 0; i < 3; i++) marketLesson(f.store, token, i);
    const lesson = f.store.startLesson(token, "gtc-start-key").lesson!;
    const defaults = lesson.form.defaults.find(
      (d) => d.symbol === lesson.recommendedAsset && d.side === "buy",
    )!;
    f.store.command(token, {
      action: "order",
      intentId: "gtc-order-key",
      attemptId: lesson.id,
      symbol: lesson.recommendedAsset,
      side: "buy",
      quantity: lesson.defaultQuantity,
      orderType: "LIMIT",
      timeInForce: "GTC",
      limitPrice: defaults.limitPrice,
    });
    f.tick(60);
    rejected(
      () =>
        f.store.command(token, {
          action: "collect",
          intentId: "blocked-collect-key",
          asset: "ETC",
        }),
      "ACTIVE_DEMONSTRATION",
    );
    const restarted = new DemoStore(f.clock, { path: f.path });
    assert.equal(restarted.state(token).lesson!.orders[0].status, "FILLED");
  } finally {
    f.clean();
  }
});

test("durability: saved question attempts and paid receipts cannot reset after restart", () => {
  const f = fixture();
  try {
    const { token } = f.store.signIn("learner", "0073", "A");
    for (let i = 0; i < 3; i++) marketLesson(f.store, token, i);
    const question = f.store.state(token).economy.questions[0];
    const wrong = {
      action: "answer",
      intentId: "question-wrong-key",
      questionId: question.id,
      questionRevision: question.revision,
      answer: "B",
    };
    f.store.command(token, wrong);
    let restarted = new DemoStore(f.clock, { path: f.path });
    assert.equal(restarted.state(token).economy.questions[0].attempts, 1);
    const correct = { ...wrong, intentId: "question-right-key", answer: "A" };
    const paid = restarted.command(token, correct);
    assert.equal(paid.state.economy.questions[0].result!.reward, "2.5");
    restarted = new DemoStore(f.clock, { path: f.path });
    assert.equal(restarted.command(token, correct).replayed, true);
    const replayed = restarted.command(token, {
      ...correct,
      intentId: "question-paid-new-key",
    });
    assert.equal(replayed.state.demoUsd, paid.state.demoUsd);
    assert.equal(replayed.state.economy.questions[0].attempts, 2);
  } finally {
    f.clean();
  }
});

test("durability: corrupted or removed initialized data fails closed and is never reseeded", () => {
  const f = fixture();
  try {
    f.store.signIn("learner", "0073", "A");
    writeFileSync(f.path, "{corrupted");
    rejected(
      () => new DemoStore(f.clock, { path: f.path }),
      "STORE_UNAVAILABLE",
    );
    assert.equal(readFileSync(f.path, "utf8"), "{corrupted");
    unlinkSync(f.path);
    rejected(
      () => new DemoStore(f.clock, { path: f.path }),
      "STORE_UNAVAILABLE",
    );
    assert.equal(existsSync(f.path), false);
  } finally {
    f.clean();
  }
});

test("durability: compare-and-swap rejects a stale writer without clobbering the accepted snapshot", () => {
  const dir = mkdtempSync(join(tmpdir(), "cot-cas-")),
    path = join(dir, "data.json");
  try {
    const first = new DurableFile(path);
    first.write({ amount: 1n });
    const second = new DurableFile(path);
    assert.deepEqual(second.read(), { amount: 1n });
    first.write({ amount: 2n });
    rejected(() => second.write({ amount: 3n }), "STORE_UNAVAILABLE");
    assert.deepEqual(new DurableFile(path).read(), { amount: 2n });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("durability: a valid checksum cannot turn malformed wallet or ledger fields into a fresh profile", () => {
  const f = fixture();
  try {
    f.store.signIn("learner", "0073", "A");
    const data = f.store.exportData();
    const invalid = data as unknown as {
      players: [string, { book: { wallet: { cash: unknown } } }][];
    };
    invalid.players[0][1].book.wallet.cash = "1000";
    const file = new DurableFile(f.path);
    file.read();
    file.write(data);
    rejected(
      () => new DemoStore(f.clock, { path: f.path }),
      "STORE_UNAVAILABLE",
    );
  } finally {
    f.clean();
  }
});

test("durability: failure at the post-mutation save rolls back wallet, order, and receipt together", () => {
  const f = fixture();
  const write = DurableFile.prototype.write;
  try {
    const { token } = f.store.signIn("learner", "0073", "A");
    const lesson = f.store.startLesson(token, "post-mutation-start").lesson!;
    const command = {
      action: "order",
      intentId: "post-mutation-buy",
      attemptId: lesson.id,
      symbol: "ETC",
      side: "buy",
      quantity: "1",
    };
    const before = f.store.state(token);
    let calls = 0;
    DurableFile.prototype.write = function (data) {
      if (++calls === 2)
        throw new PersistenceError("Injected local save failure.");
      return write.call(this, data);
    };
    rejected(() => f.store.command(token, command), "STORE_UNAVAILABLE");
    DurableFile.prototype.write = write;
    const after = f.store.state(token);
    assert.equal(after.demoUsd, before.demoUsd);
    assert.equal(after.lesson!.orders.length, 0);
    assert.equal(after.confirmedIntentIds.includes(command.intentId), false);
    const restarted = new DemoStore(f.clock, { path: f.path });
    assert.equal(restarted.command(token, command).replayed, false);
    assert.equal(restarted.command(token, command).replayed, true);
    assert.equal(restarted.state(token).lesson!.orders.length, 1);
  } finally {
    DurableFile.prototype.write = write;
    f.clean();
  }
});

test("durability: a save acknowledged ambiguously after rename recovers the accepted receipt without repeating effects", () => {
  const f = fixture();
  const write = DurableFile.prototype.write;
  try {
    const { token } = f.store.signIn("learner", "0073", "A");
    const lesson = f.store.startLesson(token, "ambiguous-save-start").lesson!;
    const command = {
      action: "order",
      intentId: "ambiguous-save-buy",
      attemptId: lesson.id,
      symbol: "ETC",
      side: "buy",
      quantity: "1",
    };
    let calls = 0;
    DurableFile.prototype.write = function (data) {
      write.call(this, data);
      if (++calls === 2)
        throw new PersistenceError(
          "Injected directory fsync acknowledgement failure.",
          true,
        );
    };
    rejected(() => f.store.command(token, command), "STORE_UNAVAILABLE");
    DurableFile.prototype.write = write;
    const restarted = new DemoStore(f.clock, { path: f.path });
    const recovered = restarted.command(token, command);
    assert.equal(recovered.replayed, true);
    assert.equal(recovered.state.lesson!.orders.length, 1);
    assert.equal(
      recovered.state.confirmedIntentIds.filter((id) => id === command.intentId)
        .length,
      1,
    );
  } finally {
    DurableFile.prototype.write = write;
    f.clean();
  }
});

test("durability: real SIGKILL after the effect-and-receipt rename recovers once from the dead writer lock", () => {
  const f = fixture();
  try {
    const { token } = f.store.signIn("learner", "0073", "A");
    const lesson = f.store.startLesson(token, "killed-writer-start").lesson!;
    const command = {
      action: "order",
      intentId: "killed-writer-buy",
      attemptId: lesson.id,
      symbol: "ETC",
      side: "buy",
      quantity: "1",
    };
    const program = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { DemoStore } from ${JSON.stringify(new URL("../store.ts", import.meta.url).href)};
      const [path,token,now,command] = process.argv.slice(1);
      const store = new DemoStore(() => Number(now), {path});
      const rename = fs.renameSync; let renames = 0;
      fs.renameSync = function(from,to) {
        rename(from,to);
        if(to === path && ++renames === 2) process.kill(process.pid,'SIGKILL');
      };
      syncBuiltinESMExports();
      store.command(token, JSON.parse(command));
      process.exit(42);
    `;
    const killed = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        program,
        f.path,
        token,
        String(f.clock()),
        JSON.stringify(command),
      ],
      { timeout: 10000, encoding: "utf8" },
    );
    assert.equal(killed.signal, "SIGKILL", killed.stderr);
    assert.equal(existsSync(f.path + ".lock"), true);
    const record = JSON.parse(readFileSync(f.path + ".lock", "utf8"));
    assert.equal(record.pid, killed.pid);
    const restarted = new DemoStore(f.clock, { path: f.path });
    const recovered = restarted.command(token, command);
    assert.equal(recovered.replayed, true);
    assert.equal(recovered.state.lesson!.orders.length, 1);
    const paidCash = recovered.state.demoUsd;
    assert.equal(restarted.command(token, command).state.demoUsd, paidCash);
    assert.equal(existsSync(f.path + ".lock"), false);
  } finally {
    f.clean();
  }
});

test("durability: a real live child writer is never stolen, then its killed lease is recoverable", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cot-live-writer-")),
    path = join(dir, "data.json");
  const writer = new DurableFile(path);
  writer.write({ amount: 1n });
  const program = `
    import {withDataLock} from ${JSON.stringify(new URL("./file.ts", import.meta.url).href)};
    withDataLock(process.argv[1],()=>{
      process.stdout.write('ready');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
    });
  `;
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", program, path],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      let text = "";
      const timer = setTimeout(
        () => reject(new Error("Live child did not acquire the lock.")),
        5000,
      );
      child.stdout.on("data", (chunk) => {
        text += chunk.toString();
        if (text.includes("ready")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Live child exited before acquiring the lock."));
      });
    });
    const record = readFileSync(path + ".lock", "utf8");
    rejected(() => writer.write({ amount: 2n }), "STORE_UNAVAILABLE");
    assert.equal(readFileSync(path + ".lock", "utf8"), record);
    assert.deepEqual(new DurableFile(path).read(), { amount: 1n });
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
    writer.write({ amount: 2n });
    assert.deepEqual(new DurableFile(path).read(), { amount: 2n });
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  }
});

test("durability: a killed stale-lock recoverer is recoverable without an age-based lease", () => {
  const dir = mkdtempSync(join(tmpdir(), "cot-dead-recoverer-")),
    path = join(dir, "data.json");
  const writer = new DurableFile(path);
  writer.write({ amount: 1n });
  const source = JSON.stringify(new URL("./file.ts", import.meta.url).href);
  try {
    const first = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        `
      import {withDataLock} from ${source};
      withDataLock(process.argv[1],()=>process.kill(process.pid,'SIGKILL'));
    `,
        path,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    assert.equal(first.signal, "SIGKILL", first.stderr);
    const second = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        `
      import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
      import {DurableFile} from ${source};
      const path=process.argv[1],unlink=fs.unlinkSync;
      fs.unlinkSync=function(file){if(file===path+'.lock')process.kill(process.pid,'SIGKILL');return unlink(file);};
      syncBuiltinESMExports();const writer=new DurableFile(path);writer.read();writer.write({amount:2n});
    `,
        path,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    assert.equal(second.signal, "SIGKILL", second.stderr);
    writer.write({ amount: 2n });
    assert.deepEqual(new DurableFile(path).read(), { amount: 2n });
    assert.equal(existsSync(path + ".lock"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
