import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  utimesSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { DemoStore } from "../store.ts";
import { MarketBook } from "../market/book.ts";
import { EconomyBook } from "./book.ts";
import { ResourceBook } from "../resources/book.ts";
import { ALL_SCENARIOS } from "../market/course.ts";
import { clearPolicyCache, getPolicy, withPolicy } from "../policy/service.ts";
const defaults = JSON.parse(
  readFileSync(new URL("../policy/defaults.json", import.meta.url), "utf8"),
);
const HOUR = 3600000;
function policies(run: (write: (p: any) => void) => void) {
  const dir = mkdtempSync(join(tmpdir(), "cot-config-fixture-")),
    file = join(dir, "policy.json"),
    old = process.env.COT_POLICY_FILE;
  let stamp = Date.now();
  const write = (p: any) => {
    writeFileSync(file, JSON.stringify(p));
    stamp += 1000;
    utimesSync(file, stamp / 1000, stamp / 1000);
  };
  try {
    process.env.COT_POLICY_FILE = file;
    clearPolicyCache();
    write(defaults);
    run(write);
  } finally {
    if (old === undefined) delete process.env.COT_POLICY_FILE;
    else process.env.COT_POLICY_FILE = old;
    clearPolicyCache();
    rmSync(dir, { recursive: true, force: true });
  }
}
function ready(now: () => number) {
  const b = new MarketBook(now),
    d = b.dump(),
    r = new ResourceBook(now);
  d.passed = new Set(
    ALL_SCENARIOS.filter(
      (s) => !s.lessonId?.startsWith("perp-") && s.lessonId !== "combined",
    ).map((s) => s.id),
  );
  r.award("ETC", 0);
  r.award("BTC", 0);
  d.resources = r.dump();
  d.wallet.quantities.BTC = 10000000n;
  b.restore(d);
  return { b, e: new EconomyBook(b, now) };
}
test("C01: accepted cost/duration/refund/effect survive a later policy; service transaction pins one version", () =>
  policies((write) => {
    let now = 0;
    const { b, e } = ready(() => now);
    let q = e.quote({
      kind: "upgrade",
      building: "town-hall",
      paymentAsset: "USD",
    });
    e.command({
      action: "upgrade",
      quoteId: q.id,
      intentId: "config-build-th",
    });
    now = 12 * HOUR;
    e.state();
    assert.equal(e.state().townHallLevel, 2);
    q = e.quote({ kind: "upgrade", building: "ETC", paymentAsset: "BTC" });
    const next = structuredClone(defaults);
    next.version = "config-next";
    next.construction.etcCostBtc = "0.002";
    next.construction.durationSeconds = 60;
    next.construction.refundNumerator = 1;
    next.construction.refundDenominator = 4;
    next.production.ETC["2"] = { rate: "9", capacity: "450" };
    withPolicy(() => {
      assert.equal(getPolicy().version, defaults.version);
      write(next);
      assert.equal(getPolicy().version, defaults.version);
    });
    assert.equal(getPolicy().version, "config-next");
    e.command({
      action: "upgrade",
      quoteId: q.id,
      intentId: "config-build-etc",
    });
    assert.equal(e.state().constructions[0].paid, "0.001");
    assert.equal(
      e.state().constructions[0].finishesAt,
      new Date(24 * HOUR).toISOString(),
    );
    const cancel = e.quote({
      kind: "cancellation",
      constructionId: e.state().constructions[0].id,
    });
    assert.match(cancel.lines[2], /0.0005 BTC/);
    now = 24 * HOUR;
    e.state();
    assert.equal(b.state().generators[0].ratePerHour, "2");
    assert.equal(b.state().generators[0].capacity, "100");
  }));
test("C02: synthetic development occupancy exercises 20/21 slots; lowered limit preserves existing jobs", () =>
  policies((write) => {
    const { e } = ready(() => 0),
      d = e.dump();
    // Isolated occupancy fixture for the slot policy. The player catalog still has
    // only three buildings and cannot create these additional fixture identities.
    for (let i = 0; i < 19; i++)
      d.constructions.set("occupied-" + i, {
        id: "occupied-" + i,
        building: ("fixture-" + i) as never,
        target: 2,
        asset: "USD",
        paid: 1n,
        startedAt: 0,
        finish: 100 * HOUR,
        refundNumerator: 1,
        refundDenominator: 2,
        policyVersion: defaults.version,
      });
    e.restore(d);
    const q = e.quote({
      kind: "upgrade",
      building: "town-hall",
      paymentAsset: "USD",
    });
    e.command({ action: "upgrade", quoteId: q.id, intentId: "slot-twentieth" });
    assert.equal(e.dump().constructions.size, 20);
    assert.throws(
      () => e.quote({ kind: "upgrade", building: "ETC", paymentAsset: "BTC" }),
      (err: any) => err.code === "CONSTRUCTION_SLOTS_FULL",
    );
    assert.equal(e.dump().constructions.size, 20);
    const next = structuredClone(defaults);
    next.version = "reduced-slots";
    next.constructionSlots["1"] = 5;
    write(next);
    assert.equal(e.state().constructions.length, 20);
    assert.throws(
      () => e.quote({ kind: "upgrade", building: "BTC", paymentAsset: "ETC" }),
      (err: any) => err.code === "CONSTRUCTION_SLOTS_FULL",
    );
    assert.equal(e.dump().constructions.size, 20);
  }));

test("C03: frozen collector production effect changes only at its accepted completion and explicit migration time", () =>
  policies((write) => {
    let now = 0;
    const { b, e } = ready(() => now),
      d = e.dump();
    d.townHall = 2;
    e.restore(d);
    const q = e.quote({
      kind: "upgrade",
      building: "ETC",
      paymentAsset: "BTC",
    });
    e.command({
      action: "upgrade",
      quoteId: q.id,
      intentId: "frozen-production-start",
    });
    const next = structuredClone(defaults);
    next.version = "later-production";
    next.production.ETC["2"] = { rate: "9", capacity: "450" };
    write(next);
    now = 13 * HOUR;
    e.synchronize();
    assert.equal(b.state().generators[0].stored, "14");
    assert.equal(b.state().generators[0].ratePerHour, "2");
    b.migrateProduction(now);
    now = 14 * HOUR;
    assert.equal(b.state().generators[0].stored, "23");
    assert.equal(b.state().generators[0].ratePerHour, "9");
  }));
test("C04: configured assistance cadence enforces exact one-hour retry and maximum two claims", () =>
  policies((write) => {
    const next = structuredClone(defaults);
    next.version = "finite-assistance";
    next.assistance.cadence = {
      kind: "configured",
      maxClaims: 2,
      cooldownSeconds: 3600,
    };
    write(next);
    let now = 0;
    const b = new MarketBook(() => now);
    b.accountWallet().cash = 20000000000000n;
    const e = new EconomyBook(b, () => now);
    let offer = e.state().assistance.offerId;
    assert.ok(offer);
    e.command({
      action: "claim-assistance",
      intentId: "first-finite-assist",
      offerId: offer,
    });
    assert.equal(b.accountWallet().cash, 120000000000000n);
    b.accountWallet().cash = 20000000000000n;
    now = HOUR - 1;
    assert.equal(e.state().assistance.available, false);
    now = HOUR;
    offer = e.state().assistance.offerId;
    assert.ok(offer);
    e.command({
      action: "claim-assistance",
      intentId: "second-finite-assist",
      offerId: offer,
    });
    assert.equal(b.accountWallet().cash, 120000000000000n);
    b.accountWallet().cash = 20000000000000n;
    now = 2 * HOUR;
    assert.equal(e.state().assistance.available, false);
    assert.throws(
      () =>
        e.command({
          action: "claim-assistance",
          intentId: "third-finite-assist",
          offerId: offer,
        }),
      (err: any) => err.code === "ASSISTANCE_UNAVAILABLE",
    );
  }));
test("C05: global policy migration reconciles another offline owner’s due upgrade before changing production", () =>
  policies((write) => {
    let now = 0;
    const store = new DemoStore(() => now),
      actor = store.signIn("learner", "0073", "A"),
      other = store.signIn("trader", "0042", "B");
    // Explicit two-owner domain fixture, unavailable through player request fields.
    const internals = store as unknown as {
      players: Map<string, { book: MarketBook; economy: EconomyBook }>;
    };
    const p = internals.players.get("trader")!,
      d = p.book.dump(),
      r = new ResourceBook(() => now);
    d.passed = new Set(
      ALL_SCENARIOS.filter((s) =>
        ["market", "gtc", "ioc-fok", "stop-limit"].includes(s.lessonId!),
      ).map((s) => s.id),
    );
    r.award("ETC", 0);
    r.award("BTC", 0);
    d.resources = r.dump();
    d.wallet.quantities.BTC = 100000000n;
    p.book.restore(d);
    const economy = p.economy.dump();
    economy.townHall = 2;
    p.economy.restore(economy);
    const quote = store.quote(other.token, {
      kind: "upgrade",
      building: "ETC",
      paymentAsset: "BTC",
    }).quote;
    store.command(other.token, {
      action: "upgrade",
      intentId: "offline-owner-upgrade",
      quoteId: quote.id,
    });
    now = 13 * HOUR;
    const next = structuredClone(defaults);
    next.version = "offline-owner-migration";
    next.production.ETC["2"] = { rate: "9", capacity: "450" };
    write(next);
    store.migratePolicy(actor.token, next.version, true);
    let state = store.state(other.token);
    assert.equal(state.generators[0].level, 2);
    assert.equal(state.generators[0].stored, "14");
    assert.equal(state.generators[0].ratePerHour, "9");
    now = 14 * HOUR;
    state = store.state(other.token);
    assert.equal(state.generators[0].stored, "23");
    assert.equal(state.generators[0].ratePerHour, "9");
  }));
test("C06: new default profiles use reloaded market seeds while continuing profiles retain their accepted marks", () =>
  policies((write) => {
    const existing = new MarketBook(() => 0),
      before = existing.currentMarks(),
      next = structuredClone(defaults);
    next.version = "new-profile-seeds";
    next.marketSeeds = { ETC: "10", SOL: "125", BTC: "30000" };
    write(next);
    getPolicy();
    const created = new MarketBook(() => 0);
    assert.deepEqual(created.currentMarks(), {
      ETC: 10000000n,
      SOL: 125000000n,
      BTC: 30000000000n,
    });
    assert.deepEqual(existing.currentMarks(), before);
  }));
test("C07: cold process restart rejects changed settings reusing a persisted policy version", () =>
  policies((write) => {
    const dir = mkdtempSync(join(tmpdir(), "cot-policy-restart-")),
      path = join(dir, "players.json");
    try {
      new DemoStore(() => 0, { path });
      const changed = structuredClone(defaults);
      changed.assistance.grant = "200";
      write(changed);
      const moduleUrl = pathToFileURL(resolve("src/mocks/store.ts")).href;
      const program = `import {DemoStore} from ${JSON.stringify(moduleUrl)};try{new DemoStore(()=>0,{path:process.argv[1]});process.exitCode=0;}catch(e){process.stdout.write(JSON.stringify({code:e.code}));process.exitCode=7;}`;
      const child = spawnSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "--input-type=module",
          "-e",
          program,
          path,
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env },
          timeout: 30000,
        },
      );
      assert.equal(child.status, 7, child.stderr);
      assert.equal(JSON.parse(child.stdout).code, "POLICY_INVALID");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }));
test("C08: assistance recovery uses the configured conversion bonus and complete destination fit", () =>
  policies((write) => {
    const candidate = () => {
      const { b } = ready(() => 0),
        d = b.dump();
      d.wallet.cash = 20000000000000n;
      d.wallet.quantities.ETC = 1000000000n;
      d.wallet.quantities.BTC = 0n;
      d.marks.ETC = 5000000n;
      b.restore(d);
      return new EconomyBook(b, () => 0, true);
    };
    let next = structuredClone(defaults);
    next.version = "small-bonus-recovery";
    next.walletCaps.USD = "80";
    next.conversion.bonusNumerator = 1;
    next.conversion.bonusDenominator = 8;
    write(next);
    const small = candidate();
    assert.equal(small.state().assistance.available, false);
    assert.match(small.state().assistance.reason, /converter/); //50+6.25 fits remaining60
    next = structuredClone(next);
    next.version = "large-bonus-recovery";
    next.walletCaps.USD = "85";
    next.conversion.bonusNumerator = 1;
    next.conversion.bonusDenominator = 2;
    write(next);
    const large = candidate();
    assert.equal(large.state().assistance.available, true); //50+25 cannot fit remaining65
  }));
test("C09: cancellation and completion retain separate immutable construction audit records across restart of the aggregate", () =>
  policies(() => {
    let now = 0;
    const { b, e } = ready(() => now);
    const q = e.quote({
      kind: "upgrade",
      building: "town-hall",
      paymentAsset: "USD",
    });
    e.command({
      action: "upgrade",
      quoteId: q.id,
      intentId: "audit-original-build",
    });
    const original = e.state().constructions[0];
    now = HOUR;
    const cancel = e.quote({
      kind: "cancellation",
      constructionId: original.id,
    });
    e.command({
      action: "cancel-upgrade",
      quoteId: cancel.id,
      intentId: "audit-original-cancel",
      acknowledged: true,
    });
    const saved = e.dump(),
      old = saved.constructionArchive.get(original.id)!;
    assert.equal(old.outcome, "canceled");
    assert.equal(old.endedAt, HOUR);
    assert.equal(old.construction.paid, 100000000000000n);
    assert.equal(old.construction.asset, "USD");
    assert.equal(old.construction.startedAt, 0);
    assert.equal(old.construction.finish, 12 * HOUR);
    assert.deepEqual(old.refund, { n: 50000000000000n, d: 1n });
    assert.equal(old.intentId, "audit-original-cancel");
    const restored = new EconomyBook(b, () => now);
    restored.restore(saved);
    const next = restored.quote({
      kind: "upgrade",
      building: "town-hall",
      paymentAsset: "USD",
    });
    restored.command({
      action: "upgrade",
      quoteId: next.id,
      intentId: "audit-restart-build",
    });
    const replacement = restored.state().constructions[0];
    assert.notEqual(replacement.id, original.id);
    now = 13 * HOUR;
    restored.synchronize();
    const history = restored.dump().constructionArchive;
    assert.equal(history.size, 2);
    assert.deepEqual(history.get(original.id), old);
    assert.equal(history.get(replacement.id)!.outcome, "completed");
    assert.equal(history.get(replacement.id)!.construction.startedAt, HOUR);
    assert.equal(history.get(replacement.id)!.endedAt, 13 * HOUR);
  }));
