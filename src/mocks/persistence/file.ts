import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  closeSync,
  fsyncSync,
  existsSync,
  unlinkSync,
  linkSync,
} from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { encodeData, decodeData } from "./codec.ts";
import { DemoError } from "../errors.ts";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const MAX_BYTES = 64_000_000;

/** A rename may succeed even when a subsequent directory fsync fails. Keep that
 * accepted state in memory so retrying the original intent cannot execute twice. */
export class PersistenceError extends DemoError {
  committed: boolean;
  constructor(message: string, committed = false) {
    super("STORE_UNAVAILABLE", message, 503);
    this.committed = committed;
  }
}

type LockOwner = {
  schema: 1;
  pid: number;
  processIdentity: string;
  token: string;
};
const processIdentity = randomUUID();
function ownerRecord(): LockOwner {
  return { schema: 1, pid: process.pid, processIdentity, token: randomUUID() };
}
function sameOwner(left: LockOwner, right: LockOwner) {
  return (
    left.pid === right.pid &&
    left.processIdentity === right.processIdentity &&
    left.token === right.token
  );
}
function readOwner(path: string): LockOwner {
  const value = JSON.parse(readFileSync(path, "utf8")) as LockOwner;
  if (
    value.schema !== 1 ||
    !Number.isSafeInteger(value.pid) ||
    value.pid < 1 ||
    typeof value.processIdentity !== "string" ||
    typeof value.token !== "string" ||
    !/^[a-f0-9-]{36}$/.test(value.processIdentity) ||
    !/^[a-f0-9-]{36}$/.test(value.token)
  )
    throw new Error("Unrecognized lock owner; explicit recovery is required");
  return value;
}
function definitelyDead(owner: LockOwner): boolean {
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}
/** Publish a complete immutable record with a hard link. Killing a process can
 * leave an orphan temporary file, but can never publish an anonymous empty lock. */
function publishOwner(path: string, owner: LockOwner) {
  const temporary = path + ".owner-" + randomUUID() + ".tmp";
  let fd: number | undefined;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, JSON.stringify(owner));
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    linkSync(temporary, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
function releaseOwner(path: string, owner: LockOwner) {
  if (!existsSync(path)) return;
  if (!sameOwner(readOwner(path), owner))
    throw new Error("Lock ownership changed");
  unlinkSync(path);
}
/** Recover only ESRCH-confirmed dead owners. A live/reused PID, EPERM, malformed
 * record or unknown state is never stolen. Each dead token has one atomic recovery
 * claim; competing recoverers follow immutable claims instead of racing unlink.
 * If the recoverer itself dies, the next claimant follows its dead owner token.
 * No elapsed-time lease can steal a paused or slow live writer. */
function acquireDataLock(path: string): () => void {
  const owner = ownerRecord();
  try {
    publishOwner(path, owner);
    return () => releaseOwner(path, owner);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const original = readOwner(path);
  let previous = original,
    claim = "";
  for (let depth = 0; depth < 100; depth++) {
    if (!definitelyDead(previous))
      throw new Error("A live or unverifiable writer owns the lock");
    const next = path + ".recovery-" + previous.token;
    try {
      publishOwner(next, owner);
      claim = next;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      previous = readOwner(next);
    }
  }
  if (!claim) throw new Error("Recovery chain requires explicit inspection");
  try {
    if (existsSync(path)) {
      if (!sameOwner(readOwner(path), original))
        throw new Error("Another writer replaced the dead lock");
      unlinkSync(path);
    }
    // An ordinary writer can win after the old lock is removed. wx-style hard
    // linking makes that a clean failure; its new lock is never removed by us.
    publishOwner(path, owner);
    return () => releaseOwner(path, owner);
  } finally {
    releaseOwner(claim, owner);
  }
}
export function withDataLock<T>(dataPath: string, run: () => T): T {
  mkdirSync(dirname(dataPath), { recursive: true, mode: 0o700 });
  let release: (() => void) | undefined;
  try {
    release = acquireDataLock(dataPath + ".lock");
    return run();
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    throw new PersistenceError(
      "A live or unverifiable local writer prevents this operation. No reset was performed.",
    );
  } finally {
    release?.();
  }
}

/** Single local writer with advisory lock + checksum compare-and-swap. This is
 * a development store, not a substitute for database transaction guarantees. */
export class DurableFile {
  readonly path: string;
  private expected: string | null = null;
  private initialized = false;

  constructor(path: string) {
    this.path = path;
  }

  read(): unknown | undefined {
    try {
      if (!existsSync(this.path)) {
        if (existsSync(this.path + ".initialized"))
          throw new Error("Previously initialized data is missing");
        return undefined;
      }
      const raw = readFileSync(this.path, "utf8");
      if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error("Large store");
      const envelope = JSON.parse(raw);
      if (
        envelope.schema !== 5 ||
        typeof envelope.payload !== "string" ||
        digest(envelope.payload) !== envelope.checksum
      )
        throw new Error("Invalid envelope");
      const data = decodeData(envelope.payload);
      this.expected = digest(raw);
      this.initialized = true;
      this.ensureMarker();
      return data;
    } catch {
      throw new PersistenceError(
        "Saved demo data needs recovery. It has not been reset.",
      );
    }
  }

  private ensureMarker() {
    const marker = this.path + ".initialized";
    if (!existsSync(marker)) {
      const fd = openSync(marker, "wx", 0o600);
      try {
        writeFileSync(fd, "COT schema 5\n");
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
  }

  write(data: unknown): void {
    const lock = this.path + ".lock";
    let release: (() => void) | undefined;
    let temporary = "";
    let committed = false;
    try {
      mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      release = acquireDataLock(lock);
      if (existsSync(this.path)) {
        if (digest(readFileSync(this.path, "utf8")) !== this.expected)
          throw new Error("A different writer changed this snapshot");
      } else if (
        this.expected !== null ||
        this.initialized ||
        existsSync(this.path + ".initialized")
      ) {
        throw new Error("Previously initialized store removed");
      }
      const payload = encodeData(data);
      const raw = JSON.stringify({
        schema: 5,
        checksum: digest(payload),
        payload,
      });
      if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error("Large store");
      // Mark first initialization before publishing the wallet. Missing data after
      // a crash is a recovery condition, never permission for another allocation.
      this.ensureMarker();
      temporary = this.path + "." + randomUUID() + ".tmp";
      const fd = openSync(temporary, "wx", 0o600);
      try {
        writeFileSync(fd, raw);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, this.path);
      committed = true;
      this.expected = digest(raw);
      this.initialized = true;
      const directory = openSync(dirname(this.path), "r");
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    } catch {
      throw new PersistenceError(
        "The demo could not safely confirm its save. Retry the original action; do not create a replacement action.",
        committed,
      );
    } finally {
      try {
        release?.();
        if (temporary && existsSync(temporary)) unlinkSync(temporary);
      } catch {
        throw new PersistenceError(
          "The local writer could not safely release its lock. Retry the original action after recovery.",
          committed,
        );
      }
    }
  }
}
