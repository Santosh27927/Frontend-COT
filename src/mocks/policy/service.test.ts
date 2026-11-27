import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePolicy, getPolicy, clearPolicyCache } from "./service.ts";
import { quantity, price, product, cash } from "../market/exact.ts";
import { ResourceBook } from "../resources/book.ts";
import { MarketBook } from "../market/book.ts";
const defaults = JSON.parse(
  readFileSync(new URL("./defaults.json", import.meta.url), "utf8"),
);
test("precision contract: one satoshi retains all twelve USD decimals; unsupported BTC price and ETC quantity reject", () => {
  assert.equal(
    cash(product(quantity("0.00000001", "BTC"), price("58639.4050", "BTC"))),
    "0.00058639405",
  );
  assert.throws(() => price("58639.405001", "BTC"));
  assert.throws(() => quantity("0.00000001", "ETC"));
  assert.equal(quantity("0.000001", "ETC"), 100n);
});
test("policy validates required caps, bounded timers, and precision; missing BTC is never unlimited", () => {
  assert.equal(validatePolicy(defaults).walletCaps.BTC, null);
  for (const change of [
    (p: any) => delete p.walletCaps.BTC,
    (p: any) => (p.marketSeeds.BTC = "58639.405001"),
    (p: any) => (p.production.ETC["1"].rate = "0"),
    (p: any) => (p.learning.fillSeconds = 200),
    (p: any) => (p.constructionSlots["1"] = 0),
    (p: any) =>
      (p.assistance.cadence = {
        kind: "configured",
        maxClaims: 0,
        cooldownSeconds: 1,
      }),
  ]) {
    const p = structuredClone(defaults);
    change(p);
    assert.throws(() => validatePolicy(p));
  }
});
test("runtime reload keeps last validated version, production migration is prospective, active timing stays frozen", () => {
  const dir = mkdtempSync(join(tmpdir(), "cot-policy-")),
    file = join(dir, "policy.json"),
    old = process.env.COT_POLICY_FILE;
  let stamp = Date.now();
  const write = (data: unknown) => {
    writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data));
    stamp += 1000;
    utimesSync(file, stamp / 1000, stamp / 1000);
  };
  try {
    process.env.COT_POLICY_FILE = file;
    clearPolicyCache();
    write(defaults);
    assert.equal(getPolicy().version, defaults.version);
    let now = 0;
    const resource = new ResourceBook(() => now),
      book = new MarketBook(() => now);
    resource.award("ETC", now);
    book.command({ action: "start", intentId: "policy-start" });
    assert.equal(book.state().lesson!.expiresAt, "1970-01-01T00:03:00.000Z");
    now = 3600000;
    const next = structuredClone(defaults);
    next.version = "next-policy";
    next.production.ETC["1"].rate = "2";
    next.learning.durationSeconds = 240;
    write(next);
    assert.equal(getPolicy().version, "next-policy");
    assert.equal(resource.views()[0].stored, "1");
    assert.equal(resource.views()[0].ratePerHour, "1");
    resource.migrate(now);
    now += 3600000;
    assert.equal(resource.views()[0].stored, "3");
    assert.equal(resource.views()[0].ratePerHour, "2");
    assert.equal(book.state().lesson!.expiresAt, "1970-01-01T00:03:00.000Z");
    write("{invalid");
    assert.equal(getPolicy().version, "next-policy");
    write({ ...next, startingCash: "999" });
    assert.equal(getPolicy().startingCash, "1000");
    rmSync(file);
    assert.equal(getPolicy().version, "next-policy");
  } finally {
    if (old === undefined) delete process.env.COT_POLICY_FILE;
    else process.env.COT_POLICY_FILE = old;
    clearPolicyCache();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("policy rejects each absent required learning timing rather than accepting a partial Object.values shape", () => {
  for (const field of [
    "durationSeconds",
    "fillSeconds",
    "triggerSeconds",
    "reviewSeconds",
  ]) {
    const p = structuredClone(defaults);
    delete p.learning[field];
    assert.throws(
      () => validatePolicy(p),
      (e: any) => e.code === "POLICY_INVALID",
      field + " is required",
    );
  }
});
test("policy validates public decimals against the wider internal quantity and price scales", () => {
  for (const change of [
    (p: any) => (p.marketSeeds.BTC = "10000000000000"),
    (p: any) => (p.walletCaps.ETC = "100000000000"),
  ]) {
    const p = structuredClone(defaults);
    change(p);
    assert.throws(
      () => validatePolicy(p),
      (e: any) => e.code === "POLICY_INVALID",
    );
  }
});
