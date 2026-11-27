import { existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  getPolicy,
  withPolicy,
  policyFingerprints,
  restorePolicyFingerprints,
} from "./policy/service.ts";
import { EconomyBook } from "./economy/book.ts";
import {
  DurableFile,
  PersistenceError,
  withDataLock,
} from "./persistence/file.ts";
import { MarketBook } from "./market/book.ts";
import { pinError, usernameError } from "../shared/validation.ts";
import { DemoError } from "./errors.ts";
import type { Receipt, Report } from "../api/market-types.ts";
import type { Device, PlayerState, SignInResult } from "../api/types.ts";
export { DemoError } from "./errors.ts";

type EnrolledDevice = { id: string; label: string; token: string };
type Player = {
  id: string;
  username: string;
  pin: string;
  revision: number;
  devices: Map<string, EnrolledDevice>;
  activeId: string | null;
  book: MarketBook;
  economy: EconomyBook;
  receipts: Map<string, { payload: string; receipt: Receipt }>;
};
type StoreOptions = { path?: string; assistanceFixture?: boolean };

// Deliberately fake credentials, for the local prototype only.
export const DEMO_ACCOUNTS = [
  { username: "learner", pin: "0073" },
  { username: "trader", pin: "0042" },
  { username: "visitor", pin: "0000" },
] as const;

export class DemoStore {
  readonly schemaVersion = 5;
  private offset = 0;
  private storage?: DurableFile;
  private players: Map<string, Player>;
  private tokens = new Map<string, { username: string; deviceId: string }>();
  private replacedTokens = new Set<string>();
  private now: () => number;

  constructor(now: () => number = Date.now, options: StoreOptions = {}) {
    this.now = () => now() + this.offset;
    this.players = new Map(
      DEMO_ACCOUNTS.map((account) => {
        const book = new MarketBook(
          this.now,
          account.username === "trader" ? "20" : "0",
        );
        const player: Player = {
          id: `demo-${account.username}`,
          username: account.username,
          pin: account.pin,
          revision: 0,
          devices: new Map(),
          activeId: null,
          book,
          economy: new EconomyBook(book, this.now, options.assistanceFixture),
          receipts: new Map(),
        };
        return [account.username, player];
      }),
    );
    if (options.path) {
      this.storage = new DurableFile(options.path);
      const saved = this.storage.read();
      if (saved !== undefined) this.restore(saved as StoreData);
      else this.storage.write(this.dump());
    }
  }

  signIn(username: unknown, pin: unknown, deviceId: unknown): SignInResult {
    const invalidName = usernameError(username),
      invalidPin = pinError(pin);
    if (invalidName) throw new DemoError("INVALID_USERNAME", invalidName);
    if (invalidPin) throw new DemoError("INVALID_PIN", invalidPin);
    if (typeof deviceId !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(deviceId))
      throw new DemoError("INVALID_DEVICE", "Choose a valid demo device.");
    const player = this.players.get(username as string);
    if (!player || player.pin !== pin)
      throw new DemoError(
        "INVALID_CREDENTIALS",
        "Account name or PIN is incorrect.",
        401,
      );
    this.reconcileAndSave(player);
    return this.atomic(() => {
      // Validate credentials before revoking the previous session. There is only
      // one current sign-in; a background read never takes control.
      for (const previous of player.devices.values()) {
        this.tokens.delete(previous.token);
        if (previous.id !== deviceId) this.replacedTokens.add(previous.token);
      }
      player.devices.clear();
      const token = randomUUID();
      player.devices.set(deviceId, {
        id: deviceId,
        label:
          deviceId.length === 1
            ? `Device ${deviceId}`
            : `Browser ${deviceId.slice(0, 6)}`,
        token,
      });
      this.tokens.set(token, { username: player.username, deviceId });
      player.activeId = deviceId;
      player.revision++;
      return { token, state: this.snapshot(player, deviceId) };
    });
  }

  state(token: string): PlayerState {
    const { player, deviceId } = this.principal(token);
    return this.atomic(() => this.snapshot(player, deviceId));
  }

  signOut(token: string): void {
    const { player, deviceId } = this.principal(token);
    this.reconcileAndSave(player);
    this.atomic(() => {
      player.devices.delete(deviceId);
      this.tokens.delete(token);
      if (player.activeId === deviceId) player.activeId = null;
      player.revision++;
    });
  }

  startLesson(
    token: string,
    intentId?: unknown,
    variantId?: unknown,
  ): PlayerState {
    return this.command(token, {
      action: "start",
      intentId,
      ...(variantId !== undefined ? { variantId } : {}),
    }).state;
  }

  command(token: string, input: unknown) {
    return withPolicy(() => this.executeCommand(token, input));
  }

  private executeCommand(token: string, input: unknown) {
    const { player, deviceId } = this.principal(token);
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new DemoError("INVALID_COMMAND", "Send a command.");
    const data = input as { action: string; intentId: string };
    if (
      typeof data.intentId !== "string" ||
      !/^[A-Za-z0-9._:-]{8,128}$/.test(data.intentId)
    )
      throw new DemoError(
        "INVALID_COMMAND",
        "A stable intent key is required.",
      );
    const payload = JSON.stringify(
      Object.fromEntries(
        Object.entries(input).sort(([a], [b]) => a.localeCompare(b)),
      ),
    );
    const old = player.receipts.get(data.intentId);
    if (old && old.payload !== payload)
      throw new DemoError(
        "IDEMPOTENCY_KEY_CONFLICT",
        "This intent key belongs to another action.",
      );
    // Accepted due events are an independent transaction. Rejecting a new order
    // must not undo an already-due fill or completed construction.
    this.reconcileAndSave(player);
    if (old)
      return this.atomic(() => ({
        receipt: structuredClone(old.receipt),
        replayed: true,
        state: this.snapshot(player, deviceId),
      }));
    const before = this.dump();
    const previousBookRevision = player.book.revision;
    try {
      const confirmation = [
        "start",
        "order",
        "finish",
        "cancel",
        "collect",
      ].includes(data.action)
        ? player.book.command(input)
        : { receipt: player.economy.command(input), replayed: false };
      player.receipts.set(data.intentId, {
        payload,
        receipt: confirmation.receipt,
      });
      player.revision++;
      const result = {
        ...confirmation,
        state: this.snapshot(player, deviceId),
      };
      this.save();
      return result;
    } catch (error) {
      if (error instanceof PersistenceError && error.committed) throw error;
      // The combined lesson intentionally records evidence of a rejected
      // unaffordable spot order. It is not a financial effect or paid receipt.
      if (
        error instanceof DemoError &&
        error.code === "INSUFFICIENT_AVAILABLE_FUNDS" &&
        player.book.revision !== previousBookRevision
      ) {
        try {
          this.save();
        } catch (saveError) {
          if (!(saveError instanceof PersistenceError && saveError.committed))
            this.restore(before);
          throw saveError;
        }
      } else this.restore(before);
      throw error;
    }
  }

  report(token: string, attemptId: unknown): Report {
    const { player } = this.principal(token);
    return this.atomic(() => {
      this.reconcile(player);
      return player.book.report(attemptId);
    });
  }

  advance(token: string, attemptId: unknown, seconds: unknown): PlayerState {
    const { player, deviceId } = this.principal(token);
    this.reconcileAndSave(player);
    return this.atomic(() => {
      player.book.advance(attemptId, seconds);
      return this.snapshot(player, deviceId);
    });
  }

  preview(token: string, input: unknown) {
    const { player, deviceId } = this.principal(token);
    this.reconcileAndSave(player);
    return this.atomic(() => ({
      preview: player.book.preview(input),
      state: this.snapshot(player, deviceId),
    }));
  }

  advanceResources(token: string, hours: unknown): PlayerState {
    const { player, deviceId } = this.principal(token);
    this.reconcileAndSave(player);
    return this.atomic(() => {
      player.book.advanceResources(hours);
      return this.snapshot(player, deviceId);
    });
  }

  quote(token: string, input: unknown) {
    const { player, deviceId } = this.principal(token);
    this.reconcileAndSave(player);
    return this.atomic(() => ({
      quote: player.economy.quote(input),
      state: this.snapshot(player, deviceId),
    }));
  }

  advanceWorld(token: string, hours: unknown): PlayerState {
    const { player, deviceId } = this.principal(token);
    if (
      typeof hours !== "number" ||
      !Number.isInteger(hours) ||
      hours < 1 ||
      hours > 72
    )
      throw new DemoError("INVALID_COMMAND", "Choose 1–72 hours.");
    this.reconcileAndSave(player);
    return this.atomic(() => {
      this.offset += hours * 3_600_000;
      for (const entry of this.players.values()) this.reconcile(entry);
      return this.snapshot(player, deviceId);
    });
  }

  migratePolicy(
    token: string,
    expectedVersion: unknown,
    acknowledged: unknown,
  ): PlayerState {
    const { player, deviceId } = this.principal(token);
    if (acknowledged !== true || typeof expectedVersion !== "string")
      throw new DemoError(
        "INVALID_REQUEST",
        "Acknowledge the exact policy version before migration.",
      );
    if (getPolicy().version !== expectedVersion)
      throw new DemoError(
        "POLICY_CHANGED",
        "Policy changed. Inspect the current version before applying.",
        409,
      );
    this.reconcileAndSave(player);
    return this.atomic(() => {
      const effectiveAt = this.now();
      // Every owner's accepted completion must precede the global production
      // migration, including owners who have not read their offline build yet.
      for (const entry of this.players.values()) this.reconcile(entry);
      for (const entry of this.players.values())
        entry.book.migrateProduction(effectiveAt);
      return this.snapshot(player, deviceId);
    });
  }

  history(token: string, cursor: unknown, limit: unknown) {
    const { player } = this.principal(token);
    if (
      (cursor !== undefined && typeof cursor !== "string") ||
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new DemoError(
        "INVALID_REQUEST",
        "Choose a history page of 1–100 records.",
      );
    return this.atomic(() => {
      this.reconcile(player);
      return player.economy.historyPage(cursor as string | undefined, limit);
    });
  }

  /** Raw fake-account data is only exposed by the loopback development backup route. */
  exportData() {
    return this.atomic(() => {
      for (const player of this.players.values()) this.reconcile(player);
      return this.dump();
    });
  }

  private reconcile(player: Player) {
    player.economy.synchronize();
  }

  private reconcileAndSave(player: Player) {
    this.atomic(() => this.reconcile(player));
  }

  private atomic<T>(run: () => T): T {
    return withPolicy(() => this.executeAtomic(run));
  }

  private executeAtomic<T>(run: () => T): T {
    const before = this.dump();
    try {
      const result = run();
      this.save();
      return result;
    } catch (error) {
      if (!(error instanceof PersistenceError && error.committed))
        this.restore(before);
      throw error;
    }
  }

  private dump() {
    return structuredClone({
      schema: 5 as const,
      policyFingerprints: policyFingerprints(),
      offset: this.offset,
      players: [...this.players].map(
        ([name, player]) =>
          [
            name,
            {
              ...player,
              book: player.book.dump(),
              economy: player.economy.dump(),
            },
          ] as const,
      ),
      tokens: this.tokens,
      replacedTokens: this.replacedTokens,
    });
  }

  private restore(data: StoreData) {
    if (
      !data ||
      data.schema !== 5 ||
      !Array.isArray(data.players) ||
      data.players.length !== DEMO_ACCOUNTS.length ||
      !(data.tokens instanceof Map) ||
      !(data.replacedTokens instanceof Set) ||
      !Number.isSafeInteger(data.offset) ||
      data.offset < 0
    )
      throw new DemoError(
        "STORE_UNAVAILABLE",
        "Invalid saved demo format. No reset was performed.",
        503,
      );
    restorePolicyFingerprints(data.policyFingerprints);
    const names = new Set(data.players.map(([name]) => name));
    if (
      names.size !== DEMO_ACCOUNTS.length ||
      DEMO_ACCOUNTS.some((a) => !names.has(a.username))
    )
      throw new DemoError(
        "STORE_UNAVAILABLE",
        "Invalid saved player catalog. No reset was performed.",
        503,
      );
    for (const [name, saved] of data.players) {
      const player = this.players.get(name);
      if (
        !player ||
        saved.id !== player.id ||
        saved.username !== name ||
        saved.pin !== player.pin ||
        !Number.isSafeInteger(saved.revision) ||
        saved.revision < 0 ||
        !(saved.devices instanceof Map) ||
        saved.devices.size > 1 ||
        !(saved.receipts instanceof Map) ||
        !saved.book ||
        !saved.economy
      )
        throw new DemoError(
          "STORE_UNAVAILABLE",
          "Invalid saved player data. No reset was performed.",
          503,
        );
    }
    const bounded = (value: unknown, positive = false) =>
      typeof value === "bigint" &&
      value >= (positive ? 1n : 0n) &&
      value <= 9223372036854775807n;
    for (const [name, saved] of data.players) {
      const book = saved.book,
        economy = saved.economy;
      if (
        !Number.isSafeInteger(book.revision) ||
        book.revision < 0 ||
        !book.wallet ||
        !bounded(book.wallet.cash) ||
        !book.wallet.quantities ||
        !book.marks ||
        !["ETC", "SOL", "BTC"].every((asset) => {
          const symbol = asset as "ETC" | "SOL" | "BTC";
          return (
            bounded(book.wallet.quantities[symbol]) &&
            bounded(book.marks[symbol], true)
          );
        }) ||
        !(book.passed instanceof Set) ||
        !(book.reports instanceof Map) ||
        !(book.receipts instanceof Map) ||
        !(book.seeds instanceof Map) ||
        !Array.isArray(book.scenarios) ||
        !book.scenarios.length ||
        !book.resources ||
        !(book.resources.resources instanceof Map) ||
        !Number.isSafeInteger(book.resources.offset) ||
        !Number.isSafeInteger(economy.revision) ||
        economy.revision < 0 ||
        ![1, 2].includes(economy.townHall) ||
        !(economy.constructions instanceof Map) ||
        !(economy.constructionArchive instanceof Map) ||
        !(economy.quotes instanceof Map) ||
        !(economy.answers instanceof Map) ||
        !Array.isArray(economy.credits) ||
        !Array.isArray(economy.claims) ||
        !Array.isArray(economy.assistClaims) ||
        !Array.isArray(economy.history) ||
        (economy.cooldown !== null && !Number.isSafeInteger(economy.cooldown))
      )
        throw new DemoError(
          "STORE_UNAVAILABLE",
          "Invalid saved exact-unit or ledger data. No reset was performed.",
          503,
        );
      if (
        (saved.activeId === null) !== (saved.devices.size === 0) ||
        (saved.activeId !== null && !saved.devices.has(saved.activeId))
      )
        throw new DemoError(
          "STORE_UNAVAILABLE",
          "Invalid saved session data. No reset was performed.",
          503,
        );
      for (const [deviceId, device] of saved.devices) {
        const session = data.tokens.get(device.token);
        if (
          device.id !== deviceId ||
          !session ||
          session.username !== name ||
          session.deviceId !== deviceId
        )
          throw new DemoError(
            "STORE_UNAVAILABLE",
            "Invalid saved session ownership. No reset was performed.",
            503,
          );
      }
    }
    this.offset = data.offset;
    this.tokens = data.tokens;
    this.replacedTokens = data.replacedTokens;
    for (const [name, saved] of data.players) {
      const player = this.players.get(name)!;
      player.revision = saved.revision;
      player.devices = saved.devices;
      player.activeId = saved.activeId;
      player.receipts = saved.receipts;
      player.book.restore(saved.book);
      player.economy.restore(saved.economy);
    }
  }

  private save() {
    this.storage?.write(this.dump());
  }

  private principal(token: string): { player: Player; deviceId: string } {
    if (this.replacedTokens.has(token))
      throw new DemoError(
        "SESSION_REPLACED",
        "You have signed in on another device.",
        401,
      );
    const session = this.tokens.get(token);
    const player = session && this.players.get(session.username);
    if (
      !session ||
      !player ||
      player.devices.get(session.deviceId)?.token !== token
    )
      throw new DemoError(
        "SESSION_REMOVED",
        "This demo session ended. Sign in again.",
        401,
      );
    return { player, deviceId: session.deviceId };
  }

  private deviceList(player: Player): Device[] {
    return [...player.devices.values()].map((device) => ({
      id: device.id,
      label: device.label,
      active: device.id === player.activeId,
    }));
  }

  private snapshot(player: Player, deviceId: string): PlayerState {
    this.reconcile(player);
    const market = player.book.state(),
      economy = player.economy.state();
    return {
      revision:
        player.revision + player.book.revision + player.economy.revision,
      serverNow: new Date(this.now()).toISOString(),
      username: player.username,
      deviceLabel: player.devices.get(deviceId)!.label,
      activeDeviceLabel: player.activeId
        ? (player.devices.get(player.activeId)?.label ?? null)
        : null,
      devices: this.deviceList(player),
      mode: "active",
      playerId: player.id,
      ...market,
      economy,
      confirmedIntentIds: [...player.receipts.keys()],
    };
  }
}

type StoreData = ReturnType<DemoStore["exportData"]>;
const globalStore = globalThis as typeof globalThis & {
  __cotDemoStore?: DemoStore;
  __cotDemoStorePath?: string;
};
function dataPath() {
  return resolve(
    process.env.COT_DEMO_DATA_DIR || ".cot-demo",
    "players-v5.json",
  );
}
function persistentStore() {
  return new DemoStore(Date.now, {
    path: dataPath(),
    assistanceFixture:
      process.env.NODE_ENV !== "production" &&
      process.env.COT_ASSISTANCE_FIXTURE === "once",
  });
}
export function getDemoStore(): DemoStore {
  const path = dataPath();
  if (
    globalStore.__cotDemoStore?.schemaVersion !== 5 ||
    globalStore.__cotDemoStorePath !== path
  ) {
    globalStore.__cotDemoStore = persistentStore();
    globalStore.__cotDemoStorePath = path;
  }
  return globalStore.__cotDemoStore;
}
export function resetDemoStore(): void {
  const path = dataPath(),
    suffix = ".reset-" + Date.now() + "-" + randomUUID();
  // Explicit development reset archives the previous disposable store, even
  // if it is malformed. Ordinary reads never enter this recovery path.
  withDataLock(path, () => {
    for (const name of [path, path + ".initialized"])
      if (existsSync(/* turbopackIgnore: true */ name))
        renameSync(name, name + suffix);
  });
  globalStore.__cotDemoStore = persistentStore();
  globalStore.__cotDemoStorePath = path;
}
