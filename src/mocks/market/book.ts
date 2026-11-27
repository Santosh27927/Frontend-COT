import { cashCredit } from "./capacity.ts";
import { room } from "../economy/amounts.ts";
import { alignPrice, ASSET_RULES } from "../policy/catalog.ts";
import { getPolicy } from "../policy/service.ts";
import { randomUUID } from "node:crypto";
import type {
  Command,
  Lesson,
  LessonId,
  MarketState,
  OrderDraft,
  Receipt,
  Report,
  ResourceInflow,
  Result,
  Symbol,
} from "../../api/market-types.ts";
import { DemoError } from "../errors.ts";
import {
  cash,
  CASH_UNIT,
  checked,
  decimal,
  format,
  product,
  quantity as parseQuantity,
  qty,
  quantityForCash,
  parseUnits,
} from "./exact.ts";
import { SCENARIOS, SYMBOLS, timing } from "./scenarios.ts";
import type { Scenario } from "./scenarios.ts";
import {
  ALL_SCENARIOS,
  LESSONS,
  formDefinition,
  goalDefinitions,
  lessonOf,
  groupOf,
  topicOf,
} from "./course.ts";
import {
  assertSafe,
  checkAuthoring,
  available,
  cancel,
  copy,
  empty,
  fail,
  parseCommand,
  parseDraft,
  pending,
  publicQuotes,
  quote,
  reconcile,
  submit,
  value,
  walletView,
  closePosition,
  risk,
} from "./execution.ts";
import type { Execution, Wallet } from "./execution.ts";
import { previewOrder, fundsDetails, assessOrder } from "./preview.ts";
import { ResourceBook } from "../resources/book.ts";
import { marginUsed, positionViews } from "./perpetual.ts";
import { evidence, comparison } from "./evidence.ts";
export { parseCommand } from "./execution.ts";
type Attempt = Execution & {
  id: string;
  scenario: Scenario;
  start: number;
  deadline: number;
  offset: number;
  practice: boolean;
  opening: Wallet;
  result: Result | null;
  resourceInflows: ResourceInflow[];
  inflowValue: bigint;
  exportedOverflow?: bigint;
};
export class MarketBook {
  revision = 0;
  private wallet: Wallet;
  private marks: Record<import("../../api/market-types.ts").Symbol, bigint>;
  private attempt: Attempt | null = null;
  private passed = new Set<string>();
  private reports = new Map<string, Report>();
  private receipts = new Map<string, { payload: string; receipt: Receipt }>();
  private seeds = new Map<string, { wallet: Wallet; scenario: Scenario }>();
  private now: () => number;
  private scenarios: Scenario[];
  private resources: ResourceBook;
  constructor(
    now: () => number = Date.now,
    ownedEtc = "0",
    scenarios: Scenario[] = ALL_SCENARIOS,
  ) {
    this.now = now;
    this.scenarios = copy(scenarios);
    if (scenarios === ALL_SCENARIOS) {
      // New default profiles resolve current seeds. Restored profiles keep their
      // persisted frames/marks; explicitly supplied test scenarios stay exact.
      const seeds = getPolicy().marketSeeds;
      for (const symbol of SYMBOLS) {
        const original = scenarios[0].frames[symbol][0];
        const current = decimal(seeds[symbol]);
        for (const scenario of this.scenarios)
          scenario.frames[symbol] = scenario.frames[symbol].map((mark) =>
            alignPrice((mark * current) / original, symbol),
          );
      }
    }
    this.marks = Object.fromEntries(
      SYMBOLS.map((a) => [a, this.scenarios[0].frames[a][0]]),
    ) as typeof this.marks;
    this.resources = new ResourceBook(now);
    this.wallet = {
      cash: parseUnits(getPolicy().startingCash, 12),
      quantities: { ...empty(), ETC: parseQuantity(ownedEtc, "ETC", false) },
    };
    assertSafe(
      {
        wallet: this.wallet,
        bought: empty(),
        orders: [],
        guides: [],
        events: [],
      },
      this.scenarios[0],
    );
  }
  command(input: unknown): { receipt: Receipt; replayed: boolean } {
    const now = this.now();
    this.synchronize(now);
    const c = parseCommand(input),
      payload = JSON.stringify(c),
      old = this.receipts.get(c.intentId);
    if (old) {
      if (old.payload !== payload)
        fail(
          "IDEMPOTENCY_KEY_CONFLICT",
          "This intent key already belongs to another command.",
        );
      return { receipt: copy(old.receipt), replayed: true };
    }
    let message: string;
    if (c.action === "start") {
      const variantId = c.variantId ?? this.nextVariant(),
        scenario = this.scenarios.find((s) => s.id === variantId);
      if (!scenario) fail("NOT_FOUND", "Scenario not found.", 404);
      if (!this.unlocked(lessonOf(scenario)))
        fail(
          "LESSON_LOCKED",
          "Complete all three scenarios in the previous lesson first.",
        );
      if (this.attempt && !this.attempt.result) {
        if (this.attempt.scenario.id !== variantId)
          fail(
            "ACTIVE_SESSION_EXISTS",
            "Finish your current scenario before opening another.",
          );
        message = "Resumed the same scenario and original deadline.";
      } else {
        const seed = this.seeds.get(variantId),
          opening = copy(seed?.wallet ?? this.wallet);
        const candidate: Attempt = {
          id: randomUUID(),
          scenario: seed ? copy(seed.scenario) : this.anchor(scenario),
          start: now,
          deadline: now + timing(seed?.scenario ?? scenario).duration,
          offset: 0,
          practice: !!seed,
          opening: copy(opening),
          wallet: opening,
          bought: empty(),
          orders: [],
          guides: [],
          events: [
            {
              second: 0,
              message: seed
                ? "Practice started. Your real portfolio and progress are protected."
                : "Scenario started. Follow the learning goals and place your order.",
            },
          ],
          result: null,
          resourceInflows: [],
          inflowValue: 0n,
          ...(groupOf(lessonOf(scenario)) !== "spot"
            ? { positions: {}, positionCloses: [], liquidations: [] }
            : {}),
        };
        assertSafe(candidate, candidate.scenario);
        this.attempt = candidate;
        message = seed
          ? "Started isolated practice."
          : "Started a new scenario.";
      }
    } else if (c.action === "collect") {
      if (this.attempt && !this.attempt.result)
        fail(
          "ACTIVE_DEMONSTRATION",
          "Collect resources between demonstrations.",
        );
      const a = this.attempt;
      const collected = this.resources.collect(
        c.asset,
        (quantity) => {
          const persistent = copy(this.wallet);
          persistent.quantities[c.asset] = checked(
            persistent.quantities[c.asset] + quantity,
          );
          const scenario = a?.scenario ?? this.scenarios[0],
            working = a && !a.result && !a.practice ? copy(a) : null;
          assertSafe(
            {
              wallet: persistent,
              bought: empty(),
              orders: [],
              guides: a?.guides ?? [],
              events: [],
            },
            scenario,
          );
          if (working) {
            working.wallet = copy(persistent);
            const marked = product(
              quantity,
              quote(
                scenario,
                c.asset,
                this.elapsed(working, now),
                working.guides,
              ),
            );
            working.inflowValue = checked(working.inflowValue + marked);
            working.resourceInflows.push({
              asset: c.asset,
              quantity: qty(quantity),
              valueAtCollection: cash(marked),
              second: Math.floor(this.elapsed(working, now) / 1000),
            });
            working.events.push({
              second: Math.floor(this.elapsed(working, now) / 1000),
              message: `Collected ${qty(quantity)} ${c.asset} from a generator. Resource inflow is excluded from trading results.`,
            });
            assertSafe(working, scenario);
          }
          return { persistent, working };
        },
        room(this.wallet, c.asset),
      );
      this.wallet = collected.prepared.persistent;
      if (collected.prepared.working) this.attempt = collected.prepared.working;
      message = `Collected ${qty(collected.quantity)} ${c.asset} into your continuing portfolio.`;
    } else {
      const a = this.attempt;
      if (!a || a.id !== c.attemptId)
        fail("NOT_FOUND", "Attempt not found.", 404);
      if (a.result)
        fail(
          "SESSION_COMPLETED",
          "This scenario has ended. View its replay or start another.",
        );
      if (c.action === "finish") {
        const evidence = this.evidence(a);
        if (
          !evidence.complete ||
          evidence.readyAt === null ||
          this.elapsed(a, now) < evidence.readyAt
        )
          fail(
            "FAST_FORWARD_NOT_READY",
            "Complete every learning goal and its observation/review period first.",
          );
        this.complete(a, now, "fast-forward");
        message =
          "Fast-forwarded to the endpoint and settled lesson purchases.";
      } else if (c.action === "cancel") {
        const candidate = copy(a),
          order = candidate.orders.find((o) => o.view.id === c.orderId);
        if (!order) fail("NOT_FOUND", "Order not found.", 404);
        cancel(candidate, order, this.elapsed(a, now), "canceled by player");
        risk(candidate, candidate.scenario, this.elapsed(a, now));
        assertSafe(candidate, candidate.scenario);
        this.attempt = candidate;
        if (!candidate.practice) this.wallet = copy(candidate.wallet);
        message = "Order canceled. Reserved funds released.";
      } else {
        this.checkOrderOptions(a, c);
        const draft: OrderDraft = c;
        const { preview, rejection } = assessOrder(
          a,
          a.scenario,
          draft,
          this.elapsed(a, now),
        );
        if (rejection) {
          if (
            a.scenario.lessonId === "combined" &&
            rejection.code === "INSUFFICIENT_AVAILABLE_FUNDS" &&
            draft.product !== "perpetual" &&
            draft.side === "buy" &&
            marginUsed(a) > 0n &&
            !a.marginRejection
          ) {
            const cost = product(
              parseQuantity(draft.quantity, draft.symbol),
              decimal(preview.referencePrice!),
            );
            const av = available(a);
            if (cost <= a.wallet.cash - av.reservedCash && cost > av.cash) {
              a.marginRejection = {
                second: Math.floor(this.elapsed(a, now) / 1000),
                symbol: draft.symbol,
                requestedQuantity: draft.quantity,
                availableCash: preview.availableCash,
                committedMargin: cash(marginUsed(a)),
                requiredCash: cash(cost),
              };
              a.rejectionOrderCount = a.orders.length;
              a.events.push({
                second: a.marginRejection.second,
                message: `Spot buy rejected: $${a.marginRejection.requiredCash} needed, $${a.marginRejection.availableCash} available because $${a.marginRejection.committedMargin} is committed to margin. No cash or assets moved.`,
              });
              this.revision++;
            }
          }
          throw new DemoError(
            rejection.code,
            preview.reason ?? "Invalid order.",
            rejection.status,
            rejection.code === "INSUFFICIENT_AVAILABLE_FUNDS"
              ? fundsDetails(preview, draft)
              : undefined,
          );
        }
        const candidate = copy(a),
          o = submit(
            candidate,
            candidate.scenario,
            draft,
            this.elapsed(candidate, now),
          );
        this.attempt = candidate;
        if (!candidate.practice) this.wallet = copy(candidate.wallet);
        message =
          o.view.status === "FILLED"
            ? `${c.side === "buy" ? "Buy" : "Sell"} order filled: ${o.view.quantity} ${c.symbol} at $${o.view.price}.`
            : o.view.status === "CANCELED"
              ? "Order canceled immediately: the limit was not matchable."
              : `${o.view.orderType} order accepted. ${o.view.orderType === "STOP_LIMIT" ? "Stop is dormant." : "Waiting for the guided price."}`;
      }
    }
    const receipt: Receipt = {
      intentId: c.intentId,
      action: c.action,
      attemptId:
        this.attempt?.id ??
        `generator-${c.action === "collect" ? c.asset : "resource"}`,
      message,
    };
    this.receipts.set(c.intentId, { payload, receipt });
    this.revision++;
    return { receipt: copy(receipt), replayed: false };
  }
  preview(input: unknown) {
    const now = this.now();
    this.synchronize(now);
    const draft = parseDraft(input, true),
      a = this.attempt;
    if (!a || a.id !== draft.attemptId)
      fail("NOT_FOUND", "Attempt not found.", 404);
    if (a.result) fail("SESSION_COMPLETED", "This scenario has ended.");
    this.checkOrderOptions(a, draft);
    return previewOrder(a, a.scenario, draft, this.elapsed(a, now));
  }
  advance(attemptId: unknown, seconds: unknown): void {
    const now = this.now();
    this.synchronize(now);
    if (
      typeof seconds !== "number" ||
      !Number.isInteger(seconds) ||
      seconds < 1 ||
      seconds > 180
    )
      fail(
        "INVALID_COMMAND",
        "Advance by an integer from 1 to 180 seconds.",
        400,
      );
    const a = this.attempt;
    if (!a || a.id !== attemptId) fail("NOT_FOUND", "Attempt not found.", 404);
    if (a.result) fail("SESSION_COMPLETED", "The scenario has ended.");
    a.offset += seconds * 1000;
    this.revision++;
    if (this.elapsed(a, now) >= timing(a.scenario).duration)
      this.complete(a, now, "developer");
    else this.synchronize(now);
  }
  advanceResources(hours: unknown): void {
    this.synchronize(this.now());
    this.resources.advance(hours);
    this.revision++;
  }
  report(id: unknown): Report {
    this.synchronize(this.now());
    const r = typeof id === "string" && this.reports.get(id);
    if (!r) fail("NOT_FOUND", "Completed report not found.", 404);
    return copy(r);
  }
  state(): MarketState {
    const now = this.now();
    this.synchronize(now);
    const a = this.attempt,
      elapsed = a
        ? a.result
          ? timing(a.scenario).duration
          : Math.min(timing(a.scenario).duration, this.elapsed(a, now))
        : 0,
      scenario = a && !a.practice ? a.scenario : this.flatScenario();
    const persistent = walletView(
      {
        wallet: this.wallet,
        orders: a && !a.practice && !a.result ? a.orders : [],
        guides: a && !a.practice ? a.guides : [],
        positions: a && !a.practice && !a.result ? a.positions : undefined,
      },
      scenario,
      elapsed,
    );
    let lesson: Lesson | null = null;
    if (a) {
      const id = lessonOf(a.scenario),
        e = this.evidence(a),
        pendingRequired = a.orders.find((o) => pending(o)),
        waitingForRisk =
          id === "perp-liquidation" &&
          Object.keys(a.positions ?? {}).length > 0,
        anchor =
          e.lastAccepted ??
          pendingRequired?.at ??
          (waitingForRisk
            ? (a.orders.find(
                (o) => o.view.product === "perpetual" && !o.view.reduceOnly,
              )?.at ?? null)
            : null),
        remaining =
          e.readyAt === null
            ? anchor === null
              ? 0
              : Math.max(
                  0,
                  Math.ceil(
                    (anchor +
                      timing(a.scenario).fill +
                      timing(a.scenario).review -
                      elapsed) /
                      1000,
                  ),
                )
            : Math.max(0, Math.ceil((e.readyAt - elapsed) / 1000));
      const stage = a.result
        ? "ended"
        : !e.complete
          ? pendingRequired || waitingForRisk
            ? "waiting"
            : "place-order"
          : remaining === 0
            ? "ready"
            : e.lastAccepted !== null &&
                elapsed < e.lastAccepted + timing(a.scenario).fill
              ? "observe"
              : "review";
      const def = formDefinition(id);
      const topic = topicOf(id);
      const defaults = SYMBOLS.flatMap((symbol) =>
        (["buy", "sell"] as const).map((side) => {
          const p = quote(a.scenario, symbol, elapsed, a.guides);
          const limit =
            topic === "ioc-fok"
              ? p
              : topic === "stop-limit"
                ? side === "buy"
                  ? (p * 1025n) / 1000n
                  : (p * 975n) / 1000n
                : side === "buy"
                  ? (p * 95n) / 100n
                  : (p * 105n) / 100n;
          const stop = side === "buy" ? (p * 105n) / 100n : (p * 95n) / 100n;
          return {
            symbol,
            side,
            limitPrice: format(alignPrice(limit, symbol)),
            stopPrice: format(alignPrice(stop, symbol)),
          };
        }),
      );
      lesson = {
        group: groupOf(id),
        ...(a.positions
          ? {
              positions: positionViews(
                a,
                Object.fromEntries(
                  SYMBOLS.map((symbol) => [
                    symbol,
                    quote(a.scenario, symbol, elapsed, a.guides),
                  ]),
                ) as Record<Symbol, bigint>,
              ),
              liquidations: copy(a.liquidations ?? []),
            }
          : {}),
        ...(comparison(a, a.scenario, elapsed)
          ? { comparison: comparison(a, a.scenario, elapsed) }
          : {}),
        ...(id === "combined"
          ? {
              marginRejection: copy(a.marginRejection ?? null),
              sharedFundsExample: this.sharedFundsExample(a, elapsed),
            }
          : {}),
        id: a.id,
        variantId: a.scenario.id,
        lessonId: id,
        lessonTitle: LESSONS.find((l) => l.id === id)!.title,
        title: a.scenario.title,
        startedAt: new Date(a.start).toISOString(),
        expiresAt: new Date(a.deadline).toISOString(),
        status: a.result ? "ended" : "active",
        remainingSeconds: Math.max(
          0,
          Math.ceil((timing(a.scenario).duration - elapsed) / 1000),
        ),
        elapsedSeconds: Math.floor(elapsed / 1000),
        assessment: a.result
          ? a.result.passed
            ? "passed"
            : "not-passed"
          : "pending",
        practice: a.practice,
        recommendedAsset: a.scenario.recommendedAsset,
        defaultQuantity: a.scenario.defaultQuantity,
        completedScenarios: this.variants(id).filter((s) => s.passed).length,
        canFastForward: !a.result && e.complete && remaining === 0,
        observation: {
          stage,
          secondsRemaining: remaining,
          message:
            stage === "ended"
              ? "Open the replay to review everything that happened."
              : stage === "waiting"
                ? waitingForRisk
                  ? "Watch isolated equity and maintenance as the adverse path develops. Actual liquidation is required."
                  : "Observe the pending/triggered order. It fills at its guided 60-second point if that fits before the deadline."
                : stage === "place-order"
                  ? goalDefinitions(id)
                      .filter((g) => !e.goals.find((x) => x.id === g.id)?.done)
                      .map((g) => g.label)
                      .join("; ")
                  : stage === "observe"
                    ? "Watch the scripted prices and how your holdings change in value."
                    : stage === "review"
                      ? "Take 20 seconds to review the outcome before Fast-forward becomes available."
                      : "You can keep watching or Fast-forward to the endpoint.",
        },
        goals: e.goals,
        form: { ...def, defaults },
        quotes: publicQuotes(a.scenario, elapsed, a.guides),
        wallet: walletView(a, a.scenario, elapsed),
        portfolioValueChange: cash(
          value(a.wallet, a.scenario, elapsed, a.guides, a.positions) +
            (a.overflowCash ?? 0n) -
            value(a.opening, a.scenario, 0) -
            a.inflowValue,
        ),
        orders: a.orders.map((o) => copy(o.view)),
        events: copy(a.events),
        result: copy(a.result),
      };
    }
    const lessons = LESSONS.filter((l) =>
      this.scenarios.some((s) => lessonOf(s) === l.id),
    ).map((l) => ({
      id: l.id,
      group: groupOf(l.id),
      title: l.title,
      completed: this.variants(l.id).filter((s) => s.passed).length,
      unlocked: this.unlocked(l.id),
      lockedReason: this.unlocked(l.id)
        ? null
        : "Complete all three scenarios in the previous lesson first.",
      variants: this.variants(l.id),
    }));
    const generators = this.resources.views().map((g) => ({
        ...g,
        canCollect:
          g.canCollect &&
          !this.active() &&
          (g.asset === "BTC" || room(this.wallet, g.asset) > 0n),
        status: this.active() ? "Collect between demonstrations." : g.status,
      })),
      etc = generators[0];
    return {
      lesson,
      demoUsd: persistent.cash,
      holdings: persistent.holdings,
      completedScenarios: this.variants("market").filter((s) => s.passed)
        .length,
      canUsePerpetuals: this.groupComplete("spot"),
      marketGroups: [
        {
          id: "spot",
          label: "Spot market",
          level: 1,
          unlocked: true,
          lockedReason: null,
        },
        {
          id: "perpetual",
          label: "Perpetuals",
          level: 2,
          unlocked: this.groupComplete("spot"),
          lockedReason: this.groupComplete("spot")
            ? null
            : "Complete all12 spot scenarios first.",
        },
        {
          id: "combined",
          label: "Combined",
          level: 3,
          unlocked: this.groupComplete("perpetual"),
          lockedReason: this.groupComplete("perpetual")
            ? null
            : "Complete the perpetual lessons first.",
        },
      ],
      course: {
        variants: this.variants(a ? lessonOf(a.scenario) : "market"),
        lessons,
        nextVariantId: this.nextVariant(),
        gtcPrerequisitesMet: this.lessonComplete("market"),
        gtcAvailable: this.lessonComplete("market"),
        spotPrerequisitesMet: this.groupComplete("spot"),
        perpetualPrerequisitesMet: this.groupComplete("perpetual"),
        allComplete: this.scenarios.every((s) => this.passed.has(s.id)),
        totalCompletedScenarios: this.passed.size,
      },
      generator: {
        earned: etc.earned,
        awardedAt: etc.awardedAt,
        productionAvailable: etc.productionAvailable,
      },
      generators,
      reports: [...this.reports.values()].map((r) => ({
        attemptId: r.attemptId,
        title: r.title,
        practice: r.practice,
        passed: r.result.passed,
      })),
      confirmedIntentIds: [...this.receipts.keys()],
    };
  }
  synchronizeNow() {
    this.synchronize(this.now());
  }
  migrateProduction(at: number) {
    this.resources.migrate(at);
    this.revision++;
  }
  takeOverflow() {
    const a = this.attempt;
    if (!a || a.practice) return [];
    const n = (a.overflowCash ?? 0n) - (a.exportedOverflow ?? 0n);
    a.exportedOverflow = a.overflowCash ?? 0n;
    return n > 0n ? [{ amount: n, origin: `trading-${a.id}` }] : [];
  }
  accountWallet() {
    return this.wallet;
  }
  active() {
    return !!this.attempt && !this.attempt.result;
  }
  currentMarks() {
    this.synchronize(this.now());
    for (const symbol of SYMBOLS) {
      const mark = this.marks[symbol];
      if (
        typeof mark !== "bigint" ||
        mark <= 0n ||
        mark > 9223372036854775807n ||
        alignPrice(mark, symbol) !== mark
      )
        throw new DemoError(
          "PRICE_UNAVAILABLE",
          "The complete simulated price snapshot is unavailable. Try again after the service recovers.",
          503,
        );
    }
    return { ...this.marks };
  }
  completedSpot() {
    return this.groupComplete("spot");
  }
  completedLesson(id: LessonId) {
    return this.lessonComplete(id);
  }
  collectorLevel(asset: import("../../api/market-types.ts").Symbol) {
    return this.resources.level(asset);
  }
  upgradeCollector(
    asset: import("../../api/market-types.ts").Symbol,
    level: number,
    at: number,
    effect?: { rate: string; capacity: string },
  ) {
    this.resources.setLevel(asset, level, at, effect);
    this.revision++;
  }
  private anchor(s: Scenario): Scenario {
    const out = copy(s);
    out.timing = structuredClone(getPolicy().learning);
    for (const asset of SYMBOLS) {
      const start = s.frames[asset][0];
      out.frames[asset] = s.frames[asset].map((p) =>
        alignPrice((p * this.marks[asset]) / start, asset),
      );
    }
    return out;
  }
  private flatScenario(): Scenario {
    return {
      ...this.scenarios[0],
      frames: Object.fromEntries(
        SYMBOLS.map((a) => [a, Array(7).fill(this.marks[a])]),
      ) as Scenario["frames"],
    };
  }
  dump() {
    return {
      revision: this.revision,
      wallet: copy(this.wallet),
      marks: copy(this.marks),
      attempt: copy(this.attempt),
      passed: copy(this.passed),
      reports: copy(this.reports),
      receipts: copy(this.receipts),
      seeds: copy(this.seeds),
      scenarios: copy(this.scenarios),
      resources: this.resources.dump(),
    };
  }
  restore(d: ReturnType<MarketBook["dump"]>) {
    this.revision = d.revision;
    this.wallet = d.wallet;
    this.marks = d.marks;
    this.attempt = d.attempt;
    this.passed = d.passed;
    this.reports = d.reports;
    this.receipts = d.receipts;
    this.seeds = d.seeds;
    this.scenarios = d.scenarios;
    this.resources.restore(d.resources);
  }
  private variants(id: LessonId) {
    return this.scenarios
      .filter((s) => lessonOf(s) === id)
      .map((s) => ({
        id: s.id,
        title: s.title,
        recommendedAsset: s.recommendedAsset,
        passed: this.passed.has(s.id),
      }));
  }
  private lessonComplete(id: LessonId): boolean {
    const group = this.variants(id);
    return group.length > 0 && group.every((s) => s.passed);
  }
  private groupComplete(group: "spot" | "perpetual") {
    return LESSONS.filter((l) => groupOf(l.id) === group).every((l) =>
      this.lessonComplete(l.id),
    );
  }
  private sharedFundsExample(a: Attempt, at: number) {
    if (!marginUsed(a)) return null;
    const symbol = a.scenario.recommendedAsset,
      price = quote(a.scenario, symbol, at, a.guides),
      av = available(a),
      q = quantityForCash(a.wallet.cash - av.reservedCash, price, symbol);
    if (q <= 0n || product(q, price) <= av.cash) return null;
    const quantity = qty(q),
      assessed = assessOrder(
        a,
        a.scenario,
        { attemptId: a.id, symbol, side: "buy", quantity },
        at,
      );
    return assessed.rejection?.code === "INSUFFICIENT_AVAILABLE_FUNDS"
      ? { symbol, quantity }
      : null;
  }
  private unlocked(id: LessonId): boolean {
    const index = LESSONS.findIndex((l) => l.id === id);
    return (
      index === 0 ||
      LESSONS.slice(0, index).every((l) => this.lessonComplete(l.id))
    );
  }
  private nextVariant(): string {
    return (
      this.scenarios.find(
        (s) => this.unlocked(lessonOf(s)) && !this.passed.has(s.id),
      ) ?? this.scenarios[0]
    ).id;
  }
  private elapsed(a: Attempt, now: number): number {
    return Math.max(0, now - a.start + a.offset);
  }
  private checkOrderOptions(a: Attempt, d: OrderDraft): void {
    const f = formDefinition(lessonOf(a.scenario));
    if (
      !(f.products ?? ["spot"]).includes(d.product ?? "spot") ||
      (d.product === "perpetual" &&
        !d.reduceOnly &&
        !(f.leverages ?? []).includes(d.leverage ?? 1)) ||
      !f.orderTypes.includes(d.orderType ?? "MARKET") ||
      !f.timeInForce.includes(d.timeInForce ?? "IOC")
    )
      fail(
        "INVALID_COMMAND",
        "This order option is not available in the current lesson.",
        400,
      );
  }
  private evidence(a: Attempt) {
    return evidence(a, a.scenario);
  }
  private synchronize(now: number): void {
    const a = this.attempt;
    if (!a || a.result) return;
    const elapsed = Math.min(timing(a.scenario).duration, this.elapsed(a, now));
    if (reconcile(a, a.scenario, elapsed)) {
      if (!a.practice) this.wallet = copy(a.wallet);
      this.revision++;
    }
    if (!a.practice)
      for (const symbol of SYMBOLS)
        this.marks[symbol] = quote(a.scenario, symbol, elapsed, a.guides);
    if (elapsed >= timing(a.scenario).duration)
      this.complete(a, a.deadline - a.offset, "deadline");
  }
  private complete(
    a: Attempt,
    completedAt: number,
    reason: Result["reason"],
  ): void {
    if (a.result) return;
    const candidate = copy(a);
    reconcile(
      candidate,
      candidate.scenario,
      timing(candidate.scenario).duration,
    );
    for (const o of candidate.orders.filter(pending))
      cancel(
        candidate,
        o,
        timing(candidate.scenario).duration,
        "scenario deadline reached",
      );
    risk(candidate, candidate.scenario, timing(candidate.scenario).duration);
    for (const symbol of SYMBOLS)
      closePosition(
        candidate,
        candidate.scenario,
        symbol,
        timing(candidate.scenario).duration,
        "settlement",
      );
    const settlements: Result["settlements"] = [];
    for (const symbol of SYMBOLS) {
      const quantity = candidate.bought[symbol];
      if (!quantity) continue;
      const price = quote(
          candidate.scenario,
          symbol,
          timing(candidate.scenario).duration,
          candidate.guides,
        ),
        proceeds = product(quantity, price);
      cashCredit(candidate, proceeds);
      candidate.wallet.quantities[symbol] -= quantity;
      settlements.push({
        symbol,
        quantity: qty(quantity),
        price: format(price),
        proceeds: cash(proceeds),
      });
    }
    const closing = walletView(
        candidate,
        candidate.scenario,
        timing(candidate.scenario).duration,
      ),
      opening = walletView(
        { wallet: candidate.opening, orders: [], guides: [] },
        candidate.scenario,
        0,
      ),
      e = this.evidence(candidate);
    const result: Result = {
      ...(candidate.positions
        ? {
            positionCloses: copy(candidate.positionCloses ?? []),
            liquidations: copy(candidate.liquidations ?? []),
          }
        : {}),
      passed: e.complete,
      practice: candidate.practice,
      cashChange: cash(
        candidate.wallet.cash +
          (candidate.overflowCash ?? 0n) -
          candidate.opening.cash,
      ),
      portfolioValueChange: cash(
        value(
          candidate.wallet,
          candidate.scenario,
          timing(candidate.scenario).duration,
          candidate.guides,
        ) +
          (candidate.overflowCash ?? 0n) -
          value(candidate.opening, candidate.scenario, 0) -
          candidate.inflowValue,
      ),
      settlements,
      completedAt: new Date(completedAt).toISOString(),
      reason,
      requirementSummary: e.complete
        ? "Every trading requirement was met. Profit is not required to pass."
        : "Not every required trading outcome completed before the deadline.",
      resourceInflows: copy(candidate.resourceInflows),
    };
    candidate.events.push(
      ...settlements.map((s) => ({
        second: timing(candidate.scenario).duration / 1000,
        message: `Closed ${s.quantity} lesson-purchased ${s.symbol} at $${s.price}; $${s.proceeds} returned to Demo USD.`,
      })),
      {
        second: timing(candidate.scenario).duration / 1000,
        message: result.passed
          ? "Trading requirement met. Scenario passed."
          : "Trading requirements incomplete. Try this scenario again.",
      },
    );
    candidate.result = result;
    const report: Report = {
      ...(comparison(
        candidate,
        candidate.scenario,
        timing(candidate.scenario).duration,
      )
        ? {
            comparison: comparison(
              candidate,
              candidate.scenario,
              timing(candidate.scenario).duration,
            ),
          }
        : {}),
      attemptId: candidate.id,
      title: candidate.scenario.title,
      variantId: candidate.scenario.id,
      lessonId: lessonOf(candidate.scenario),
      practice: candidate.practice,
      opening,
      closing,
      quotes: publicQuotes(
        candidate.scenario,
        timing(candidate.scenario).duration,
        candidate.guides,
      ),
      orders: candidate.orders.map((o) => copy(o.view)),
      events: copy(candidate.events),
      result: copy(result),
    };
    this.attempt = candidate;
    if (!candidate.practice) {
      this.wallet = copy(candidate.wallet);
      for (const symbol of SYMBOLS)
        this.marks[symbol] = quote(
          candidate.scenario,
          symbol,
          timing(candidate.scenario).duration,
          candidate.guides,
        );
      if (result.passed) {
        this.passed.add(candidate.scenario.id);
        this.seeds.set(candidate.scenario.id, {
          wallet: copy(candidate.opening),
          scenario: copy(candidate.scenario),
        });
        const reward = LESSONS.find(
          (l) => l.id === lessonOf(candidate.scenario),
        )!.reward;
        if (reward && this.lessonComplete(lessonOf(candidate.scenario)))
          this.resources.award(reward, completedAt);
      }
    }
    this.reports.set(candidate.id, report);
    this.revision++;
  }
}
