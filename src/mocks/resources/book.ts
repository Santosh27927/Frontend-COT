import type { GeneratorView, Symbol } from "../../api/market-types.ts";
import { DemoError } from "../errors.ts";
import { qty, quantity } from "../market/exact.ts";
import { alignQuantity, COLLECTORS } from "../policy/catalog.ts";
import { getPolicy } from "../policy/service.ts";
const HOUR = 3600000n;
type Setting = { rate: string; capacity: string };
type Resource = {
  awardedAt: string;
  last: number;
  stored: bigint;
  level: number;
  setting: Setting;
  policyVersion: string;
};
export class ResourceBook {
  private resources = new Map<Symbol, Resource>();
  private offset = 0;
  private now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }
  private settings(asset: Symbol, level: number): Setting {
    const row = getPolicy().production[asset as "ETC" | "BTC"]?.[String(level)];
    if (!row)
      throw new DemoError(
        "FEATURE_NOT_CONFIGURED",
        "Collector settings are unavailable.",
        409,
      );
    return structuredClone(row);
  }
  award(asset: Symbol, wallTime: number) {
    if (!COLLECTORS.includes(asset)) return;
    if (!this.resources.has(asset))
      this.resources.set(asset, {
        awardedAt: new Date(wallTime).toISOString(),
        last: wallTime + this.offset,
        stored: 0n,
        level: 1,
        setting: this.settings(asset, 1),
        policyVersion: getPolicy().version,
      });
  }
  level(asset: Symbol) {
    return this.resources.get(asset)?.level ?? 0;
  }
  private accrue(asset: Symbol, r: Resource, at = this.now() + this.offset) {
    const elapsed = Math.max(0, at - r.last),
      cap = quantity(r.setting.capacity, asset) * HOUR;
    // A lowered capacity never confiscates stored assets. Production resumes only below the new cap.
    if (r.stored < cap) {
      r.stored += BigInt(elapsed) * quantity(r.setting.rate, asset);
      if (r.stored > cap) r.stored = cap;
    }
    r.last = Math.max(r.last, at);
  }
  setLevel(asset: Symbol, level: number, at: number, effect?: Setting) {
    const r = this.resources.get(asset);
    if (!r)
      throw new DemoError("UPGRADE_LOCKED", "Earn this collector first.", 409);
    this.accrue(asset, r, at + this.offset);
    r.setting = effect ? structuredClone(effect) : this.settings(asset, level);
    r.level = level;
    r.policyVersion = getPolicy().version;
  }
  /** Explicit effective-time migration. Merely changing policy JSON never rewrites owned production history. */
  migrate(at: number) {
    for (const [asset, r] of this.resources) {
      this.accrue(asset, r, at + this.offset);
      r.setting = this.settings(asset, r.level);
      r.policyVersion = getPolicy().version;
    }
  }
  views(): GeneratorView[] {
    return COLLECTORS.map((asset) => {
      const r = this.resources.get(asset);
      if (r) this.accrue(asset, r);
      const setting = r?.setting ?? this.settings(asset, 1),
        amount = r ? alignQuantity(r.stored / HOUR, asset) : 0n;
      return {
        asset,
        earned: !!r,
        awardedAt: r?.awardedAt ?? null,
        level: r?.level ?? 0,
        productionAvailable: !!r,
        stored: qty(amount),
        ratePerHour: setting.rate,
        capacity: setting.capacity,
        canCollect: amount > 0n,
        status: !r
          ? "Tutorial reward · locked"
          : amount >= quantity(setting.capacity, asset)
            ? "Storage full · production paused"
            : amount > 0n
              ? "Ready to collect"
              : `Producing · ${setting.rate} ${asset} per hour`,
      };
    });
  }
  collect<T>(
    asset: Symbol,
    prepare: (q: bigint) => T,
    maximum?: bigint,
  ): { quantity: bigint; prepared: T } {
    const r = this.resources.get(asset);
    if (!r)
      throw new DemoError("LESSON_LOCKED", "Earn this collector first.", 409);
    this.accrue(asset, r);
    let amount = alignQuantity(r.stored / HOUR, asset);
    if (maximum !== undefined && maximum < amount)
      amount = alignQuantity(maximum, asset);
    if (amount <= 0n)
      throw new DemoError(
        maximum === 0n ? "DESTINATION_STORAGE_FULL" : "NOTHING_TO_COLLECT",
        maximum === 0n
          ? `${asset} wallet storage is full.`
          : "There are no collectible resources yet.",
        409,
      );
    const prepared = prepare(amount);
    r.stored -= amount * HOUR;
    return { quantity: amount, prepared };
  }
  advance(hours: unknown) {
    if (
      typeof hours !== "number" ||
      !Number.isInteger(hours) ||
      hours < 1 ||
      hours > 60
    )
      throw new DemoError(
        "INVALID_COMMAND",
        "Advance resources by 1–60 hours.",
      );
    this.offset += hours * 3600000;
    this.views();
  }
  dump() {
    return { resources: structuredClone(this.resources), offset: this.offset };
  }
  restore(data: ReturnType<ResourceBook["dump"]>) {
    this.resources = data.resources;
    this.offset = data.offset;
  }
}
