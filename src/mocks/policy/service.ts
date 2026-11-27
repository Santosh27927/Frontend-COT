import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { DemoError } from "../errors.ts";
export type Policy = {
  schemaVersion: 1;
  version: string;
  startingCash: string;
  walletCaps: Record<"USD" | "ETC" | "SOL", string> & { BTC: null };
  constructionSlots: Record<string, number>;
  conversion: {
    sourceValue: string;
    bonusNumerator: number;
    bonusDenominator: number;
    quoteSeconds: number;
    cooldownSeconds: number;
  };
  construction: {
    durationSeconds: number;
    townHallUsdCost: string;
    etcCostBtc: string;
    btcCostEtc: string;
    refundNumerator: number;
    refundDenominator: number;
  };
  production: Record<
    "ETC" | "BTC",
    Record<string, { rate: string; capacity: string }>
  >;
  quiz: { firstCorrect: string; laterCorrect: string };
  assistance: {
    threshold: string;
    grant: string;
    cadence:
      | { kind: "unconfigured" }
      | { kind: "configured"; cooldownSeconds: number; maxClaims: number };
  };
  learning: {
    durationSeconds: number;
    fillSeconds: number;
    triggerSeconds: number;
    reviewSeconds: number;
  };
  marketSeeds: Record<"ETC" | "SOL" | "BTC", string>;
};
function invalid(): never {
  throw new DemoError(
    "POLICY_INVALID",
    "The service settings could not be activated.",
    503,
  );
}
function amount(v: unknown, dp: number, internalDp = dp) {
  if (
    typeof v !== "string" ||
    v.length > 26 ||
    !new RegExp(`^(0|[1-9]\\d*)(\\.\\d{1,${dp}})?$`).test(v) ||
    !/[1-9]/.test(v)
  )
    invalid();
  const [whole, f = ""] = v.split(".");
  if (
    BigInt(whole) * 10n ** BigInt(internalDp) +
      BigInt(f.padEnd(internalDp, "0")) >
    9223372036854775807n
  )
    invalid();
}
const integer = (v: unknown, max = 315360000) => {
  if (!Number.isSafeInteger(v) || (v as number) < 1 || (v as number) > max)
    invalid();
};
export function validatePolicy(input: unknown): Policy {
  const p = input as Policy;
  if (
    !p ||
    p.schemaVersion !== 1 ||
    typeof p.version !== "string" ||
    !/^[a-zA-Z0-9._-]{1,64}$/.test(p.version) ||
    !p.walletCaps ||
    p.walletCaps.BTC !== null ||
    !Object.hasOwn(p.walletCaps, "BTC") ||
    !p.conversion ||
    !p.construction ||
    !p.quiz ||
    !p.assistance ||
    !p.marketSeeds ||
    !p.production ||
    !p.constructionSlots
  )
    invalid();
  amount(p.startingCash, 12);
  amount(p.walletCaps.USD, 12);
  amount(p.walletCaps.ETC, 6, 8);
  amount(p.walletCaps.SOL, 6, 8);
  if (
    !Object.keys(p.constructionSlots).length ||
    !p.constructionSlots["1"] ||
    !p.constructionSlots["2"]
  )
    invalid();
  for (const [level, n] of Object.entries(p.constructionSlots)) {
    if (!/^[1-9]\d*$/.test(level)) invalid();
    integer(n, 10000);
  }
  const c = p.conversion;
  amount(c.sourceValue, 12);
  integer(c.bonusNumerator, 10000);
  integer(c.bonusDenominator, 10000);
  integer(c.quoteSeconds, 3600);
  integer(c.cooldownSeconds);
  const b = p.construction;
  amount(b.townHallUsdCost, 12);
  amount(b.etcCostBtc, 8);
  amount(b.btcCostEtc, 6, 8);
  integer(b.durationSeconds);
  integer(b.refundNumerator, 10000);
  integer(b.refundDenominator, 10000);
  if (b.refundNumerator > b.refundDenominator) invalid();
  for (const a of ["ETC", "BTC"] as const)
    for (const level of ["1", "2"]) {
      const row = p.production[a]?.[level];
      if (!row) invalid();
      amount(row.rate, a === "BTC" ? 8 : 6, 8);
      amount(row.capacity, a === "BTC" ? 8 : 6, 8);
    }
  amount(p.quiz.firstCorrect, 12);
  amount(p.quiz.laterCorrect, 12);
  amount(p.assistance.threshold, 12);
  amount(p.assistance.grant, 12);
  if (
    !p.assistance.cadence ||
    !["unconfigured", "configured"].includes(p.assistance.cadence.kind)
  )
    invalid();
  if (p.assistance.cadence.kind === "configured") {
    integer(p.assistance.cadence.cooldownSeconds);
    integer(p.assistance.cadence.maxClaims, 10000);
  }
  if (!p.learning) invalid();
  for (const key of [
    "durationSeconds",
    "fillSeconds",
    "triggerSeconds",
    "reviewSeconds",
  ] as const)
    integer(p.learning[key], 86400);
  if (
    p.learning.triggerSeconds >= p.learning.fillSeconds ||
    p.learning.fillSeconds + p.learning.reviewSeconds >
      p.learning.durationSeconds
  )
    invalid();
  for (const a of ["ETC", "SOL", "BTC"] as const)
    amount(p.marketSeeds[a], a === "BTC" ? 4 : 6, 6);
  return structuredClone(p);
}
let cached: { path: string; stamp: string; policy: Policy } | undefined;
let failure: string | null = null;
const versions = new Map<string, string>();
export function policyFingerprints() {
  return new Map(versions);
}
export function restorePolicyFingerprints(saved: unknown) {
  if (!(saved instanceof Map)) invalid();
  for (const [version, hash] of saved) {
    if (
      typeof version !== "string" ||
      typeof hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      invalid();
    if (versions.has(version) && versions.get(version) !== hash)
      throw new DemoError(
        "POLICY_INVALID",
        "A saved policy version was reused with different settings. Restore it or publish a new version.",
        503,
      );
  }
  for (const [version, hash] of saved) versions.set(version, hash);
}
let transactionPolicy: Policy | undefined;
/** A synchronous service transaction resolves one immutable policy revision. */
export function withPolicy<T>(run: () => T): T {
  if (transactionPolicy) return run();
  transactionPolicy = getPolicy();
  try {
    return run();
  } finally {
    transactionPolicy = undefined;
  }
}
function freeze(value: unknown) {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
}
export function getPolicy(): Policy {
  if (transactionPolicy) return transactionPolicy;
  const path =
    process.env.COT_POLICY_FILE ||
    resolve(process.cwd(), "src/mocks/policy/defaults.json");
  try {
    // Runtime policy is supplied beside the service, not bundled from an
    // arbitrary filesystem path into the browser/server build artifact.
    const stat = statSync(/* turbopackIgnore: true */ path);
    const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}:${stat.ino}`;
    if (cached?.path === path && cached.stamp === stamp) return cached.policy;
    const policy = validatePolicy(
        JSON.parse(readFileSync(/* turbopackIgnore: true */ path, "utf8")),
      ),
      hash = createHash("sha256").update(JSON.stringify(policy)).digest("hex"),
      previous = versions.get(policy.version);
    if (previous && previous !== hash) invalid();
    versions.set(policy.version, hash);
    freeze(policy);
    cached = { path, stamp, policy };
    failure = null;
    return policy;
  } catch (error) {
    failure =
      "Policy reload failed; last validated configuration remains active.";
    if (cached?.path === path) return cached.policy;
    throw error instanceof DemoError
      ? error
      : new DemoError(
          "POLICY_UNAVAILABLE",
          "Validated service settings are unavailable.",
          503,
        );
  }
}
export function policyStatus() {
  return { version: getPolicy().version, warning: failure };
}
export function clearPolicyCache() {
  cached = undefined;
  failure = null;
  versions.clear();
}
