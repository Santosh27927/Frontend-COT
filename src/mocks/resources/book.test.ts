import { test } from "node:test";
import assert from "node:assert/strict";
import { ResourceBook } from "./book.ts";
import { DemoError } from "../errors.ts";
import { checked, MAX } from "../market/exact.ts";
const err = (f: () => unknown, code: string) =>
  assert.throws(f, (e) => e instanceof DemoError && e.code === code);
test("G: exact1/hour,50cap, paused time discarded and collection resumes without backfill", () => {
  let now = 0;
  const r = new ResourceBook(() => now);
  now = 10 * 3600000;
  r.award("ETC", now);
  assert.equal(r.views()[0].stored, "0");
  now += 3600000;
  assert.equal(r.views()[0].stored, "1");
  now += 59 * 3600000;
  assert.equal(r.views()[0].stored, "50");
  const c = r.collect("ETC", (q) => q);
  assert.equal(c.quantity, 5000000000n);
  assert.equal(r.views()[0].stored, "0");
  err(() => r.collect("ETC", (q) => q), "NOTHING_TO_COLLECT");
  now += 3600000;
  assert.equal(r.views()[0].stored, "1");
});
test("G: sub-unit fractional accrual preserved across frequent collection; no time before award", () => {
  let now = 1000000;
  const r = new ResourceBook(() => now);
  r.award("ETC", now);
  now += 1;
  assert.equal(r.views()[0].stored, "0");
  err(() => r.collect("ETC", (q) => q), "NOTHING_TO_COLLECT");
  now += 3;
  assert.equal(r.collect("ETC", (q) => q).quantity, 100n);
  now += 3599996;
  assert.equal(r.collect("ETC", (q) => q).quantity, 99999900n);
  assert.equal(r.views()[0].stored, "0");
});
test("G: prepare failure/overflow cannot debit generator; locked/unsupported assets cannot collect", () => {
  let now = 0;
  const r = new ResourceBook(() => now);
  err(() => r.collect("ETC", (q) => q), "LESSON_LOCKED");
  r.award("ETC", 0);
  r.award("SOL", 0);
  r.award("BTC", 0);
  now = 3600000;
  const before = r.views();
  err(() => r.collect("ETC", (q) => checked(MAX + q)), "INVALID_COMMAND");
  assert.deepEqual(r.views(), before);
  err(() => r.collect("SOL", (q) => q), "LESSON_LOCKED");
  assert.equal(r.collect("BTC", (q) => q).quantity, 10000n);
  assert.equal(r.collect("ETC", (q) => q).quantity, 100000000n);
});
test("G: resource debug clock is bounded, does not configure assets or backdate new awards", () => {
  const r = new ResourceBook(() => 0);
  for (const n of [0, -1, 1.1, 61, "1"])
    err(() => r.advance(n), "INVALID_COMMAND");
  r.advance(60);
  r.award("ETC", 0);
  r.award("SOL", 0);
  assert.equal(r.views()[0].stored, "0");
  r.advance(1);
  assert.equal(r.views()[0].stored, "1");
  assert.equal(r.views()[1].productionAvailable, false);
  assert.equal(r.views()[1].capacity, "0.005");
});
