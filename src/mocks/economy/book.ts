import { randomUUID, createHash } from "node:crypto";
import type {
  EconomyState,
  EconomyQuote,
  QuoteRequest,
  EconomyCommand,
  Building,
} from "../../api/economy-types.ts";
import type { Receipt, LessonId, Symbol } from "../../api/market-types.ts";
import type { MarketBook } from "../market/book.ts";
import { DemoError, errorStatus } from "../errors.ts";
import { ASSETS, type Asset } from "../policy/catalog.ts";
import { getPolicy } from "../policy/service.ts";
import { cash, checked, format, parseUnits, product } from "../market/exact.ts";
import {
  add,
  subtract,
  fraction,
  whole,
  less,
  balance,
  setBalance,
  atom,
  display,
  room,
  min,
  type Fraction,
  entitlementText,
  ratioLabel,
} from "./amounts.ts";
import questions from "./questions.json" with { type: "json" };

type Credit = { id: string; asset: Asset; amount: Fraction; origin: string };
type Construction = {
  id: string;
  building: Building;
  target: number;
  asset: Asset;
  paid: bigint;
  finish: number;
  refundNumerator: number;
  refundDenominator: number;
  policyVersion: string;
  startedAt: number;
  effect?: { rate: string; capacity: string };
};
type Quote = EconomyQuote & {
  request: QuoteRequest;
  source?: Asset;
  destination?: Asset;
  debit?: bigint;
  base?: bigint;
  bonus?: Fraction;
  change?: Fraction;
  construction?: Construction;
  refund?: Fraction;
  durationMs?: number;
  cooldownSeconds?: number;
};
type Answer = {
  attempts: number;
  paid: boolean;
  result: EconomyState["questions"][number]["result"];
};
function reject(code: string, message: string): never {
  throw new DemoError(code, message, errorStatus(code));
}
const isAsset = (v: unknown): v is Asset => ASSETS.includes(v as Asset);
const isBuilding = (v: unknown): v is Building =>
  ["town-hall", "ETC", "BTC"].includes(v as string);
const exactKeys = (v: Record<string, unknown>, keys: string[]) => {
  if (Object.keys(v).some((k) => !keys.includes(k)))
    reject("INVALID_COMMAND", "Unexpected request fields.");
};
export class EconomyBook {
  revision = 0;
  private townHall = 1;
  private constructions = new Map<string, Construction>();
  private constructionArchive = new Map<
    string,
    {
      construction: Construction;
      outcome: "completed" | "canceled";
      endedAt: number;
      refund?: Fraction;
      intentId?: string;
    }
  >();
  private quotes = new Map<string, Quote>();
  private credits: Credit[] = [];
  private claims: {
    intentId: string;
    asset: Asset;
    allocations: { creditId: string; origin: string; amount: Fraction }[];
  }[] = [];
  private answers = new Map<string, Answer>();
  private cooldown: number | null = null;
  private assistClaims: number[] = [];
  private history: EconomyState["history"] = [];
  private announced = false;
  private offer: { id: string; policyVersion: string; grant: string } | null =
    null;
  private book: MarketBook;
  private now: () => number;
  private assistanceFixture: boolean;
  constructor(
    book: MarketBook,
    now: () => number = Date.now,
    assistanceFixture = false,
  ) {
    this.book = book;
    this.now = now;
    this.assistanceFixture = assistanceFixture;
  }
  private log(message: string) {
    this.history.unshift({
      id: randomUUID(),
      at: new Date(this.now()).toISOString(),
      message,
    });
    this.revision++;
  }
  private between() {
    if (this.book.active())
      reject(
        "ACTIVE_DEMONSTRATION",
        "Return after finishing the active demonstration.",
      );
  }
  private prices() {
    return this.book.currentMarks();
  }
  private value(a: Asset, n: bigint, prices: Record<Symbol, bigint>) {
    return a === "USD" ? n : product(n, prices[a]);
  }
  private units(a: Asset, v: bigint, prices: Record<Symbol, bigint>) {
    return a === "USD" ? v : whole(fraction(v * 100n, prices[a]), a);
  }
  private available(a: Asset) {
    return balance(this.book.accountWallet(), a);
  }
  private requireFunds(a: Asset, n: bigint) {
    if (this.available(a) < n)
      reject(
        "INSUFFICIENT_AVAILABLE_FUNDS",
        `Available ${a}: ${display(a, this.available(a))}. Required: ${display(a, n)}.`,
      );
  }
  private requireRoom(a: Asset, f: Fraction) {
    const free = room(this.book.accountWallet(), a);
    if (less(fraction(free), f))
      reject(
        "DESTINATION_STORAGE_FULL",
        `${a} destination storage is full or has insufficient space. Available room: ${display(a, free)} ${a}.`,
      );
  }
  private debit(a: Asset, n: bigint) {
    this.requireFunds(a, n);
    setBalance(this.book.accountWallet(), a, this.available(a) - n);
  }
  owed(asset: Asset, amount: Fraction, origin: string) {
    if (amount.n <= 0n) return;
    this.credits.push({ id: randomUUID(), asset, amount, origin });
    this.revision++;
  }
  credit(asset: Asset, amount: Fraction, origin: string) {
    const free = room(this.book.accountWallet(), asset),
      n = min(whole(amount, asset), free);
    if (n > 0n)
      setBalance(
        this.book.accountWallet(),
        asset,
        checked(this.available(asset) + n),
      );
    this.owed(asset, subtract(amount, fraction(n)), origin);
  }
  private pool(a: Asset) {
    return this.credits
      .filter((c) => c.asset === a)
      .reduce((sum, c) => add(sum, c.amount), fraction(0n));
  }
  synchronize() {
    this.book.synchronizeNow();
    for (const c of this.constructions.values())
      if (this.now() >= c.finish) {
        if (c.building === "town-hall") this.townHall = c.target;
        else
          this.book.upgradeCollector(c.building, c.target, c.finish, c.effect);
        this.constructionArchive.set(c.id, {
          construction: structuredClone(c),
          outcome: "completed",
          endedAt: c.finish,
        });
        this.constructions.delete(c.id);
        this.log(`${c.building} level ${c.target} completed.`);
      }
    if (this.book.completedSpot() && !this.announced) {
      this.announced = true;
      this.log("Level 1 complete. Converter and perpetual learning unlocked.");
    }
    const out = this.book.takeOverflow();
    for (const row of out) this.owed("USD", fraction(row.amount), row.origin);
  }
  private checkBuilding(building: Building) {
    const p = getPolicy(),
      level =
        building === "town-hall"
          ? this.townHall
          : this.book.collectorLevel(building);
    if (this.constructions.size >= p.constructionSlots[String(this.townHall)])
      reject("CONSTRUCTION_SLOTS_FULL", "No construction slot is available.");
    if ([...this.constructions.values()].some((c) => c.building === building))
      reject(
        "CONSTRUCTION_EXISTS",
        "This building already has an active upgrade.",
      );
    if (
      level !== 1 ||
      !this.book.completedSpot() ||
      (building !== "town-hall" && this.townHall < 2)
    )
      reject(
        "UPGRADE_LOCKED",
        "Complete the required lessons and Town Hall upgrade first.",
      );
  }
  private build(building: Building, payment: Asset): Construction {
    const p = getPolicy();
    this.checkBuilding(building);
    let paid: bigint;
    if (building === "town-hall") {
      const value = atom("USD", p.construction.townHallUsdCost),
        prices = this.prices();
      paid = this.units(payment, value, prices);
      if (this.value(payment, paid, prices) < value)
        paid += payment === "USD" ? 1n : payment === "BTC" ? 1n : 100n;
    } else {
      const required = building === "ETC" ? "BTC" : "ETC";
      if (payment !== required)
        reject(
          "INVALID_PAYMENT_ASSET",
          `${building} collector requires ${required}.`,
        );
      paid = atom(
        payment,
        building === "ETC"
          ? p.construction.etcCostBtc
          : p.construction.btcCostEtc,
      );
    }
    if (paid <= 0n)
      reject(
        "AMOUNT_TOO_SMALL",
        "The cost is below the supported asset precision.",
      );
    this.requireFunds(payment, paid);
    return {
      id: randomUUID(),
      startedAt: this.now(),
      building,
      target: 2,
      asset: payment,
      paid,
      finish: this.now() + p.construction.durationSeconds * 1000,
      refundNumerator: p.construction.refundNumerator,
      refundDenominator: p.construction.refundDenominator,
      policyVersion: p.version,
      ...(building !== "town-hall"
        ? { effect: structuredClone(p.production[building]["2"]) }
        : {}),
    };
  }
  private conversionTerms(source: Asset, destination: Asset) {
    const p = getPolicy(),
      prices = this.prices(),
      target = atom("USD", p.conversion.sourceValue);
    if (this.value(source, this.available(source), prices) < target)
      reject(
        "INSUFFICIENT_AVAILABLE_FUNDS",
        `At least $${p.conversion.sourceValue} of available ${source} is required.`,
      );
    const debit = this.units(source, target, prices),
      v = this.value(source, debit, prices),
      base = this.units(destination, v, prices),
      baseValue = this.value(destination, base, prices);
    if (!debit || !base)
      reject(
        "AMOUNT_TOO_SMALL",
        "This conversion would produce zero received units.",
      );
    // Return source-value rounding change; exact fractional atoms stay owed rather than disappearing.
    const change =
      source === "USD"
        ? fraction(v - baseValue)
        : fraction((v - baseValue) * 100n, prices[source]);
    const bonus = fraction(
      base * BigInt(p.conversion.bonusNumerator),
      BigInt(p.conversion.bonusDenominator),
    );
    this.requireRoom(destination, add(fraction(base), bonus));
    return { prices, debit, v, base, baseValue, bonus, change };
  }
  quote(input: unknown): EconomyQuote {
    this.synchronize();
    this.between();
    if (!input || typeof input !== "object" || Array.isArray(input))
      reject("INVALID_REQUEST", "Choose a quote.");
    const r = input as QuoteRequest;
    const p = getPolicy(),
      q: Quote = {
        id: randomUUID(),
        kind: r.kind,
        request: structuredClone(r),
        expiresAt: new Date(
          this.now() + p.conversion.quoteSeconds * 1000,
        ).toISOString(),
        policyVersion: p.version,
        lines: [],
        confirmation: "",
      };
    if (r.kind === "conversion") {
      exactKeys(r as unknown as Record<string, unknown>, [
        "kind",
        "source",
        "destination",
      ]);
      if (
        !isAsset(r.source) ||
        !isAsset(r.destination) ||
        r.source === r.destination
      )
        reject("INVALID_CONVERSION", "Choose two different supported assets.");
      this.conversionAvailable();
      const { prices, debit, v, base, bonus, change } = this.conversionTerms(
        r.source,
        r.destination,
      );
      Object.assign(q, {
        source: r.source,
        destination: r.destination,
        debit,
        base,
        bonus,
        change,
        cooldownSeconds: p.conversion.cooldownSeconds,
      });
      q.lines = [
        `Source: ${display(r.source, debit)} ${r.source} (quoted value $${cash(v)})`,
        `Receive: ${display(r.destination, base)} ${r.destination}`,
        `Bonus: ${display(r.destination, whole(bonus, r.destination))} ${r.destination}; any fraction remains owed.`,
        `Source rounding change: ${display(r.source, whole(change, r.source))} ${r.source}; any fraction remains owed.`,
        `Zero fees. Asset values fluctuate after conversion. Next conversion: ${p.conversion.cooldownSeconds / 3600} hours after success.`,
      ];
      const total = add(fraction(base), bonus),
        remainder = subtract(total, fraction(whole(total, r.destination)));
      q.lines.push(
        `Total entitlement: ${entitlementText(r.destination, total)}. Wallet credit: ${display(r.destination, whole(total, r.destination))} ${r.destination}. Pending fraction: ${entitlementText(r.destination, remainder)}.`,
        `Source available: ${display(r.source, this.available(r.source))} ${r.source}. Destination free: ${p.walletCaps[r.destination] === null ? "Unlimited gameplay storage" : `${display(r.destination, room(this.book.accountWallet(), r.destination))} ${r.destination}`}.`,
        `Exact source change: ${entitlementText(r.source, change)}.`,
        `Simulated prices at ${new Date(this.now()).toISOString()}: ${r.source} = $${r.source === "USD" ? "1.00" : format(prices[r.source])}; ${r.destination} = $${r.destination === "USD" ? "1.00" : format(prices[r.destination])}.`,
      );
      q.confirmation = "Accept the quoted conversion and volatility risk";
    } else if (r.kind === "upgrade") {
      exactKeys(r as unknown as Record<string, unknown>, [
        "kind",
        "building",
        "paymentAsset",
      ]);
      if (!isBuilding(r.building) || !isAsset(r.paymentAsset))
        reject("INVALID_REQUEST", "Choose a building and payment asset.");
      q.construction = this.build(r.building, r.paymentAsset);
      q.durationMs = p.construction.durationSeconds * 1000;
      q.lines = [
        `Upgrade ${r.building} to level 2`,
        `Pay ${display(q.construction.asset, q.construction.paid)} ${q.construction.asset}`,
        `Duration: ${p.construction.durationSeconds / 3600} hours. Existing production continues.`,
      ];
      const paidValue = this.value(
        r.paymentAsset,
        q.construction.paid,
        this.prices(),
      );
      q.lines.push(
        `Quoted USD payment value: $${cash(paidValue)}${r.building === "town-hall" ? `; target $${p.construction.townHallUsdCost}; asset-step rounding above target $${cash(paidValue - atom("USD", p.construction.townHallUsdCost))}` : ""}.`,
        `Available: ${display(r.paymentAsset, this.available(r.paymentAsset))} ${r.paymentAsset}. Simulated price at ${new Date(this.now()).toISOString()}: $${r.paymentAsset === "USD" ? "1.00" : format(this.prices()[r.paymentAsset])}.`,
        `Cancellation returns ${ratioLabel(q.construction.refundNumerator, q.construction.refundDenominator)} of the original paid asset units, after acknowledgement.`,
      );
      q.confirmation = "Pay and start construction";
    } else if (r.kind === "cancellation") {
      exactKeys(r as unknown as Record<string, unknown>, [
        "kind",
        "constructionId",
      ]);
      const c = this.constructions.get(r.constructionId);
      if (!c) reject("NOT_FOUND", "Active construction not found.");
      q.construction = structuredClone(c);
      q.refund = fraction(
        c.paid * BigInt(c.refundNumerator),
        BigInt(c.refundDenominator),
      );
      q.lines = [
        `Cancel ${c.building} construction`,
        `Original cost: ${display(c.asset, c.paid)} ${c.asset}`,
        `Refund: ${display(c.asset, whole(q.refund, c.asset))} ${c.asset}. Any fractional or capacity excess remains owed.`,
        `The remaining cost is lost. Restart requires a fresh full payment and timer.`,
      ];
      q.lines.push(
        `Exact refund entitlement: ${entitlementText(c.asset, q.refund)}. Exact lost amount: ${entitlementText(c.asset, subtract(fraction(c.paid), q.refund))}.`,
      );
      q.confirmation = "I acknowledge the cancellation loss";
    } else reject("INVALID_REQUEST", "Unsupported quote.");
    this.quotes.set(q.id, q);
    this.revision++;
    return this.publicQuote(q);
  }
  private publicQuote(q: Quote): EconomyQuote {
    return {
      id: q.id,
      kind: q.kind,
      expiresAt: q.expiresAt,
      policyVersion: q.policyVersion,
      lines: q.lines,
      confirmation: q.confirmation,
    };
  }
  private conversionAvailable() {
    if (!this.book.completedSpot())
      reject(
        "CONVERTER_LOCKED",
        "Complete all twelve spot scenarios to unlock conversion.",
      );
    if (this.cooldown !== null && this.now() < this.cooldown)
      reject(
        "CONVERSION_COOLDOWN",
        `Conversion unlocks at ${new Date(this.cooldown).toISOString()}.`,
      );
  }
  private help() {
    const p = getPolicy(),
      available = this.available("USD");
    if (this.book.active())
      return {
        available: false,
        reason: "Finish the active demonstration first.",
      };
    if (available >= atom("USD", p.assistance.threshold))
      return {
        available: false,
        reason: `Available Demo USD must be below $${p.assistance.threshold}.`,
      };
    for (const a of ASSETS)
      if (
        whole(this.pool(a), a) > 0n &&
        room(this.book.accountWallet(), a) > 0n
      )
        return {
          available: false,
          reason: "Claim your pending credits first.",
        };
    if (
      this.book
        .state()
        .generators.some(
          (g) =>
            g.canCollect &&
            (g.asset === "BTC" ||
              room(this.book.accountWallet(), g.asset) > 0n),
        )
    )
      return { available: false, reason: "Collect available resources first." };
    if (
      this.book.completedSpot() &&
      (this.cooldown === null || this.now() >= this.cooldown)
    ) {
      for (const asset of ASSETS.filter((a) => a !== "USD")) {
        try {
          this.conversionTerms(asset, "USD");
          return {
            available: false,
            reason: "A converter recovery is available first.",
          };
        } catch (error) {
          if (
            !(error instanceof DemoError) ||
            ![
              "INSUFFICIENT_AVAILABLE_FUNDS",
              "DESTINATION_STORAGE_FULL",
              "AMOUNT_TOO_SMALL",
            ].includes(error.code)
          )
            throw error;
        }
      }
    }
    const cadence = p.assistance.cadence;
    if (cadence.kind === "unconfigured" && !this.assistanceFixture)
      return {
        available: false,
        reason: "Assistance frequency is awaiting testing configuration.",
      };
    const limit = this.assistanceFixture
      ? 1
      : cadence.kind === "configured"
        ? cadence.maxClaims
        : 0;
    if (this.assistClaims.length >= limit)
      return {
        available: false,
        reason: "This assistance policy has no remaining claims.",
      };
    if (
      cadence.kind === "configured" &&
      this.assistClaims.length &&
      this.now() < this.assistClaims.at(-1)! + cadence.cooldownSeconds * 1000
    )
      return {
        available: false,
        reason: "The assistance cooldown is still active.",
      };
    return {
      available: true,
      reason: this.assistanceFixture
        ? "Development fixture: one claim per test player."
        : "Claim the available assistance offer.",
    };
  }
  command(input: unknown): Receipt {
    this.synchronize();
    this.between();
    if (!input || typeof input !== "object" || Array.isArray(input))
      reject("INVALID_COMMAND", "Send a command.");
    const c = input as EconomyCommand;
    const origin = c.intentId;
    let message = "";
    if (["convert", "upgrade", "cancel-upgrade"].includes(c.action)) {
      const cmd = c as Extract<EconomyCommand, { quoteId: string }>;
      exactKeys(
        cmd as unknown as Record<string, unknown>,
        c.action === "cancel-upgrade"
          ? ["action", "intentId", "quoteId", "acknowledged"]
          : ["action", "intentId", "quoteId"],
      );
      const q = this.quotes.get(cmd.quoteId);
      if (!q) reject("QUOTE_NOT_FOUND", "Request a fresh quote.");
      if (this.now() >= Date.parse(q.expiresAt))
        reject("QUOTE_EXPIRED", "This quote expired. Review a new quote.");
      if (c.action === "convert") {
        if (q.kind !== "conversion")
          reject("INVALID_QUOTE", "This is not a conversion quote.");
        this.conversionAvailable();
        this.requireFunds(q.source!, q.debit!);
        this.requireRoom(q.destination!, add(fraction(q.base!), q.bonus!));
        this.debit(q.source!, q.debit!);
        this.credit(q.destination!, add(fraction(q.base!), q.bonus!), origin);
        this.credit(q.source!, q.change!, origin);
        this.cooldown =
          this.now() +
          (q as Quote & { cooldownSeconds: number }).cooldownSeconds * 1000;
        message = "Conversion completed, including the quoted game bonus.";
      } else if (c.action === "upgrade") {
        if (q.kind !== "upgrade")
          reject("INVALID_QUOTE", "This is not an upgrade quote.");
        const frozen = q.construction!;
        this.checkBuilding(frozen.building);
        this.requireFunds(frozen.asset, frozen.paid);
        this.debit(frozen.asset, frozen.paid);
        const started = {
          ...frozen,
          startedAt: this.now(),
          finish: this.now() + q.durationMs!,
        };
        // Duration belongs to the binding quote, not subsequent policy changes.

        this.constructions.set(started.id, started);
        message = `${started.building} upgrade started. Paid ${display(started.asset, started.paid)} ${started.asset}; finishes ${new Date(started.finish).toISOString()}.`;
      } else {
        if (
          q.kind !== "cancellation" ||
          c.action !== "cancel-upgrade" ||
          c.acknowledged !== true
        )
          reject(
            "ACKNOWLEDGEMENT_REQUIRED",
            "Acknowledge the exact cancellation loss.",
          );
        const con = this.constructions.get(q.construction!.id);
        if (!con || this.now() >= con.finish)
          reject(
            "CONSTRUCTION_COMPLETED",
            "This construction can no longer be canceled.",
          );
        this.constructionArchive.set(con.id, {
          construction: structuredClone(con),
          outcome: "canceled",
          endedAt: this.now(),
          refund: structuredClone(q.refund!),
          intentId: c.intentId,
        });
        this.constructions.delete(con.id);
        this.credit(con.asset, q.refund!, origin);
        message = `Construction canceled. Quoted refund: ${entitlementText(con.asset, q.refund!)}; overflow remains pending.`;
      }
      this.quotes.delete(q.id);
    } else if (c.action === "claim-credit") {
      exactKeys(c as unknown as Record<string, unknown>, [
        "action",
        "intentId",
        "asset",
      ]);
      if (!isAsset(c.asset))
        reject("INVALID_COMMAND", "Choose a supported asset.");
      const n = min(
        whole(this.pool(c.asset), c.asset),
        room(this.book.accountWallet(), c.asset),
      );
      if (n <= 0n)
        reject(
          "NOTHING_TO_CLAIM",
          "No whole-unit credit fits in the wallet yet.",
        );
      let remaining = fraction(n);
      const allocations: {
        creditId: string;
        origin: string;
        amount: Fraction;
      }[] = [];
      for (const row of this.credits.filter((x) => x.asset === c.asset)) {
        const used = less(row.amount, remaining) ? row.amount : remaining;
        allocations.push({
          creditId: row.id,
          origin: row.origin,
          amount: structuredClone(used),
        });
        row.amount = subtract(row.amount, used);
        remaining = subtract(remaining, used);
        if (!remaining.n) break;
      }
      this.claims.push({ intentId: c.intentId, asset: c.asset, allocations });
      this.credits = this.credits.filter((x) => x.amount.n > 0n);
      setBalance(
        this.book.accountWallet(),
        c.asset,
        this.available(c.asset) + n,
      );
      message = `Claimed ${display(c.asset, n)} ${c.asset} from existing pending credits.`;
    } else if (c.action === "answer") {
      exactKeys(c as unknown as Record<string, unknown>, [
        "action",
        "intentId",
        "questionId",
        "questionRevision",
        "answer",
      ]);
      const q = questions.find((q) => q.id === c.questionId);
      if (!q || !this.book.completedLesson(q.lessonId as LessonId))
        reject(
          "QUESTION_LOCKED",
          "Complete the lesson’s three scenarios first.",
        );
      if (c.questionRevision !== this.questionRevision(q))
        reject(
          "QUESTION_STALE",
          "This question changed. Review the current question before answering.",
        );
      if (!q.options.some((o) => o.id === c.answer))
        reject("INVALID_ANSWER", "Choose one of the displayed answers.");
      const old = this.answers.get(q.id) ?? {
        attempts: 0,
        paid: false,
        result: null,
      };
      if (old.paid) {
        message = "This question is already completed. No additional reward.";
      } else {
        const attempts = old.attempts + 1,
          correct = q.correct === c.answer,
          reward = correct
            ? attempts === 1
              ? getPolicy().quiz.firstCorrect
              : getPolicy().quiz.laterCorrect
            : "0";
        this.answers.set(q.id, {
          attempts,
          paid: correct,
          result: {
            correct,
            correctAnswer: q.correct,
            explanation: q.explanation,
            reward,
          },
        });
        if (correct) this.credit("USD", fraction(atom("USD", reward)), origin);
        message = correct
          ? `Correct. Reward: ${reward} Demo USD.`
          : "Try again for free. Review the explanation below.";
      }
    } else if (c.action === "claim-assistance") {
      exactKeys(c as unknown as Record<string, unknown>, [
        "action",
        "intentId",
        "offerId",
      ]);
      const help = this.help();
      if (
        !this.offer ||
        this.offer.id !== c.offerId ||
        this.offer.policyVersion !== getPolicy().version
      )
        reject(
          "ASSISTANCE_UNAVAILABLE",
          "Review the current assistance offer.",
        );
      if (!help.available) reject("ASSISTANCE_UNAVAILABLE", help.reason);
      this.credit("USD", fraction(atom("USD", this.offer.grant)), origin);
      this.assistClaims.push(this.now());
      message = `Claimed an extra ${this.offer.grant} Demo USD.`;
      this.offer = null;
    } else reject("INVALID_COMMAND", "Unsupported village command.");
    this.log(message);
    return {
      intentId: c.intentId,
      action: c.action,
      attemptId: "village",
      message,
    };
  }
  private questionRevision(q: (typeof questions)[number]) {
    return createHash("sha256")
      .update(JSON.stringify(q))
      .digest("hex")
      .slice(0, 16);
  }
  state(): EconomyState {
    this.synchronize();
    const p = getPolicy(),
      manual = !this.book.active(),
      prices = this.prices(),
      help = this.help();
    if (help.available) {
      if (!this.offer || this.offer.policyVersion !== p.version) {
        this.offer = {
          id: randomUUID(),
          policyVersion: p.version,
          grant: p.assistance.grant,
        };
        this.revision++;
      }
    } else if (this.offer) {
      this.offer = null;
      this.revision++;
    }
    return {
      policyVersion: p.version,
      learningLevel: this.book.completedSpot() ? 2 : 1,
      townHallLevel: this.townHall,
      manualActionsAllowed: manual,
      prices: (["ETC", "SOL", "BTC"] as const).map((asset) => ({
        asset,
        price: format(prices[asset]),
        asOf: new Date(this.now()).toISOString(),
      })),
      wallet: ASSETS.map((asset) => ({
        asset,
        balance: display(asset, this.available(asset)),
        capacity: p.walletCaps[asset],
        capacityKind: p.walletCaps[asset] === null ? "unlimited" : "fixed",
        free: display(asset, room(this.book.accountWallet(), asset)),
      })),
      credits: ASSETS.map((asset) => {
        const pool = this.pool(asset);
        return {
          asset,
          owed: display(asset, whole(pool, asset)),
          claimable: display(
            asset,
            min(whole(pool, asset), room(this.book.accountWallet(), asset)),
          ),
          origins: this.credits.filter((c) => c.asset === asset).length,
          canClaim:
            manual &&
            min(whole(pool, asset), room(this.book.accountWallet(), asset)) >
              0n,
          fractionalRemainder:
            subtract(pool, fraction(whole(pool, asset))).n > 0n,
        };
      }),
      converter: {
        unlocked: this.book.completedSpot(),
        available:
          manual &&
          this.book.completedSpot() &&
          (this.cooldown === null || this.now() >= this.cooldown),
        reason: !manual
          ? "Finish the active demonstration first."
          : !this.book.completedSpot()
            ? "Complete all twelve spot scenarios first."
            : this.cooldown !== null && this.now() < this.cooldown
              ? `Conversion unlocks at ${new Date(this.cooldown).toISOString()}.`
              : `Choose a source and destination. The service quotes the fixed $${p.conversion.sourceValue} value.`,
        nextAt:
          this.cooldown === null ? null : new Date(this.cooldown).toISOString(),
        principal: p.conversion.sourceValue,
        bonus: ratioLabel(
          p.conversion.bonusNumerator,
          p.conversion.bonusDenominator,
        ),
      },
      buildings: (
        [
          {
            id: "town-hall",
            label: "Town Hall",
            level: this.townHall,
            paymentAssets: [...ASSETS],
          },
          {
            id: "ETC",
            label: "ETC collector",
            level: this.book.collectorLevel("ETC"),
            paymentAssets: ["BTC"],
          },
          {
            id: "BTC",
            label: "BTC collector",
            level: this.book.collectorLevel("BTC"),
            paymentAssets: ["ETC"],
          },
        ] as {
          id: Building;
          label: string;
          level: number;
          paymentAssets: Asset[];
        }[]
      ).map((b) => ({
        ...b,
        canUpgrade:
          manual &&
          b.level === 1 &&
          this.book.completedSpot() &&
          (b.id === "town-hall" || this.townHall >= 2) &&
          ![...this.constructions.values()].some((c) => c.building === b.id) &&
          this.constructions.size < p.constructionSlots[String(this.townHall)],
        reason: !manual
          ? "Finish your demonstration first."
          : b.level === 0
            ? "Earn this collector through the spot lessons."
            : b.level >= 2
              ? "Maximum prototype level reached."
              : !this.book.completedSpot()
                ? "Complete twelve spot scenarios first."
                : b.id !== "town-hall" && this.townHall < 2
                  ? "Requires Town Hall level 2."
                  : "Review the cost before starting.",
      })),
      constructions: [...this.constructions.values()].map((c) => ({
        id: c.id,
        building: c.building,
        targetLevel: c.target,
        finishesAt: new Date(c.finish).toISOString(),
        paid: display(c.asset, c.paid),
        asset: c.asset,
        canCancel: manual,
      })),
      questions: questions.map((q) => {
        const a = this.answers.get(q.id);
        return {
          id: q.id,
          revision: this.questionRevision(q),
          lessonId: q.lessonId as LessonId,
          prompt: q.prompt,
          options: q.options,
          unlocked: manual && this.book.completedLesson(q.lessonId as LessonId),
          attempts: a?.attempts ?? 0,
          paid: a?.paid ?? false,
          result: a?.result ?? null,
        };
      }),
      assistance: {
        offerId: this.offer?.id ?? null,
        ...help,
        grant: p.assistance.grant,
        policyStatus: this.assistanceFixture
          ? "Development fixture · maximum one claim"
          : p.assistance.cadence.kind,
      },
      announcements: this.announced
        ? ["Converter unlocked by completing all twelve spot scenarios."]
        : [],
      history: this.history.slice(0, 100),
    };
  }
  historyPage(cursor?: string, limit = 20) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      reject("INVALID_REQUEST", "Choose a history page size from 1 to 100.");
    let start = 0;
    if (cursor) {
      const at = this.history.findIndex((h) => h.id === cursor);
      if (at < 0) reject("INVALID_REQUEST", "History cursor not found.");
      start = at + 1;
    }
    const items = structuredClone(this.history.slice(start, start + limit));
    return {
      items,
      nextCursor: start + limit < this.history.length ? items.at(-1)!.id : null,
    };
  }
  dump() {
    return structuredClone({
      revision: this.revision,
      townHall: this.townHall,
      constructions: this.constructions,
      constructionArchive: this.constructionArchive,
      quotes: this.quotes,
      credits: this.credits,
      claims: this.claims,
      answers: this.answers,
      cooldown: this.cooldown,
      assistClaims: this.assistClaims,
      history: this.history,
      announced: this.announced,
      offer: this.offer,
    });
  }
  restore(d: ReturnType<EconomyBook["dump"]>) {
    this.revision = d.revision;
    this.townHall = d.townHall;
    this.constructions = d.constructions;
    this.constructionArchive = d.constructionArchive;
    this.quotes = d.quotes;
    this.credits = d.credits;
    this.claims = d.claims;
    this.answers = d.answers;
    this.cooldown = d.cooldown;
    this.assistClaims = d.assistClaims;
    this.history = d.history;
    this.announced = d.announced;
    this.offer = d.offer;
  }
}
