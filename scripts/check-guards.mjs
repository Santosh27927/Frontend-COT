// Mutation checks run ONLY in disposable source copies. Never edit the live app.
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = process.cwd(),
  target = process.argv[2] || resolve("test-results/guard-removal.json");
const cases = [
  {
    id: "expiry",
    file: "src/mocks/economy/book.ts",
    from: "if (this.now() >= Date.parse(q.expiresAt))",
    to: "if (false)",
    test: "src/mocks/economy/book.test.ts",
    pattern: "E04:",
  },
  {
    id: "capacity",
    file: "src/mocks/economy/book.ts",
    from: "if (less(fraction(free), f))",
    to: "if (false)",
    test: "src/mocks/economy/book.test.ts",
    pattern: "E20:",
  },
  {
    id: "active-demonstration",
    file: "src/mocks/economy/book.ts",
    from: "private between() {\n    if (this.book.active())",
    to: "private between() {\n    if (false)",
    test: "src/mocks/economy/book.test.ts",
    pattern: "E17:",
  },
  {
    id: "fraction-pool",
    file: "src/mocks/economy/book.ts",
    from: ".reduce((sum, c) => add(sum, c.amount), fraction(0n))",
    to: ".reduce((sum, c) => fraction(0n), fraction(0n))",
    test: "src/mocks/economy/book.test.ts",
    pattern: "E07:",
  },
  {
    id: "assist-exact50",
    file: "src/mocks/economy/book.ts",
    from: 'if (available >= atom("USD", p.assistance.threshold))',
    to: 'if (available > atom("USD", p.assistance.threshold))',
    test: "src/mocks/economy/book.test.ts",
    pattern: "E15:",
  },
  {
    id: "practice-wallet",
    file: "src/mocks/market/book.ts",
    from: "if (!candidate.practice) {",
    to: "if (true) {",
    test: "src/mocks/economy/book.test.ts",
    pattern: "E21:",
  },
  {
    id: "receipt-recovery",
    file: "src/mocks/store.ts",
    from: "if (old)\n",
    to: "if (false && old)\n",
    test: "src/mocks/economy/store-contract.test.ts",
    pattern: "S01:",
  },
  {
    id: "all-owner-migration",
    file: "src/mocks/store.ts",
    from: "for (const entry of this.players.values()) this.reconcile(entry);",
    to: "/* deliberately removed offline-owner reconciliation */",
    occurrence: "last",
    test: "src/mocks/economy/configuration.test.ts",
    pattern: "C05:",
  },
];
const results = [];
for (const c of cases) {
  const dir = mkdtempSync(join(tmpdir(), "cot-guard-removal-"));
  try {
    cpSync(resolve(root, "src"), join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"type":"module"}');
    const file = join(dir, c.file),
      source = readFileSync(file, "utf8");
    const occurrences = source.split(c.from).length - 1;
    if (occurrences !== 1 && c.occurrence !== "last")
      throw Error(`${c.id}: stale mutation anchor (${occurrences})`);
    if (!occurrences) throw Error(`${c.id}: missing guard`);
    const at =
      c.occurrence === "last"
        ? source.lastIndexOf(c.from)
        : source.indexOf(c.from);
    writeFileSync(
      file,
      source.slice(0, at) + c.to + source.slice(at + c.from.length),
    );
    const run = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--test",
        "--test-name-pattern",
        c.pattern,
        c.test,
      ],
      {
        cwd: dir,
        encoding: "utf8",
        timeout: 30000,
        env: {
          ...process.env,
          COT_POLICY_FILE: join(dir, "src/mocks/policy/defaults.json"),
        },
      },
    );
    const output = run.stdout + run.stderr;
    const killed =
      run.status === 1 &&
      !/ERR_MODULE_NOT_FOUND|SyntaxError|ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/.test(
        output,
      );
    results.push({
      id: c.id,
      guardFile: c.file,
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      test: c.test,
      pattern: c.pattern,
      mutantRejected: killed,
      exitCode: run.status,
      evidence: output.slice(-6000),
    });
    if (!killed)
      throw Error(`${c.id}: mutation survived or test did not execute`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
mkdirSync(dirname(target), { recursive: true });
writeFileSync(
  target,
  JSON.stringify(
    {
      executedAt: new Date().toISOString(),
      scope: "isolated source copies; no live tree mutation or network",
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    guards: results.length,
    rejected: results.filter((r) => r.mutantRejected).length,
    evidence: target,
  }),
);
