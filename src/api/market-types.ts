export type Symbol = "ETC" | "SOL" | "BTC";
export type Product = "spot" | "perpetual";
export type MarketGroup = "spot" | "perpetual" | "combined";
export type LessonId =
  | "market"
  | "gtc"
  | "ioc-fok"
  | "stop-limit"
  | "perp-direction"
  | "perp-collateral"
  | "perp-size"
  | "perp-liquidation"
  | "perp-gtc"
  | "perp-ioc-fok"
  | "perp-stop"
  | "combined";
export type OrderType = "MARKET" | "LIMIT" | "STOP_LIMIT";
export type TimeInForce = "IOC" | "GTC" | "FOK";
export type OrderDraft = {
  attemptId: string;
  symbol: Symbol;
  side: "buy" | "sell";
  quantity: string;
  orderType?: OrderType;
  timeInForce?: TimeInForce;
  limitPrice?: string;
  stopPrice?: string;
  product?: Product;
  leverage?: number;
  reduceOnly?: boolean;
};
export type CoreCommand =
  | { action: "start"; intentId: string; variantId?: string }
  | ({ action: "order"; intentId: string } & OrderDraft)
  | { action: "finish"; intentId: string; attemptId: string }
  | { action: "cancel"; intentId: string; attemptId: string; orderId: string }
  | { action: "collect"; intentId: string; asset: Symbol };
export type Command = CoreCommand | import("./economy-types.ts").EconomyCommand;
export type Receipt = {
  intentId: string;
  action: Command["action"];
  attemptId: string;
  message: string;
};
export type FundsDetails = {
  symbol: Symbol;
  side: "buy" | "sell";
  availableCash: string;
  availableAsset: string;
  maxQuantity: string;
  referencePrice: string;
  requiredCash: string;
  requestedQuantity: string;
};
export type OrderPreview = {
  product?: Product;
  committedMargin?: string;
  marginRequired?: string;
  notional?: string;
  pendingOrder: Order | null;
  blockedByPendingOrder: boolean;
  attemptId: string;
  symbol: Symbol;
  side: "buy" | "sell";
  availableCash: string;
  reservedCash: string;
  availableAsset: string;
  maxQuantity: string | null;
  referencePrice: string | null;
  estimatedCost: string | null;
  valid: boolean;
  reason: string | null;
};
export type QuotePoint = {
  second: number;
  price: string;
  x: number;
  y: number;
};
export type Holding = { asset: Symbol; quantity: string; value: string };
export type WalletView = {
  cash: string;
  holdings: Holding[];
  portfolioValue: string;
  availableCash?: string;
  reservedCash?: string;
  committedMargin?: string;
  unrealizedPnl?: string;
};
export type PositionView = {
  id: string;
  symbol: Symbol;
  side: "buy" | "sell";
  leverage: number;
  quantity: string;
  entryNotional: string;
  entryPrice: string;
  margin: string;
  currentNotional: string;
  unrealizedPnl: string;
  equity: string;
  maintenance: string;
  availableQuantity: string;
  closeOrder: Omit<OrderDraft, "attemptId"> | null;
};
export type PositionClose = {
  orderId: string;
  positionId: string;
  symbol: Symbol;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  entryNotional: string;
  marginReleased: string;
  realizedPnl: string;
  rawPnl: string;
  trainingBackstop: string;
  second: number;
  reason: "user" | "liquidation" | "settlement";
  full: boolean;
};
export type Liquidation = PositionClose & {
  equity: string;
  maintenance: string;
};
export type ComparisonFill = {
  orderId: string;
  symbol: Symbol;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  margin: string;
  notional: string;
  leverage: number;
  illustrativeGain: string;
  illustrativeLoss: string;
};
export type Comparison = {
  policy: "same-collateral" | "same-size";
  baseline: ComparisonFill | null;
  baselineClosed: boolean;
  paired: ComparisonFill | null;
  targetQuantity: string | null;
  collateralDifference: string | null;
  message: string;
  nextOrder: Omit<OrderDraft, "attemptId"> | null;
};
export type MarginRejection = {
  second: number;
  symbol: Symbol;
  requestedQuantity: string;
  availableCash: string;
  committedMargin: string;
  requiredCash: string;
};
export type Order = {
  product?: Product;
  leverage?: number;
  reduceOnly?: boolean;
  positionId?: string;
  margin?: string;
  realizedPnl?: string;
  id: string;
  second: number;
  symbol: Symbol;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  total: string;
  status: "FILLED" | "PENDING" | "TRIGGERED" | "CANCELED";
  orderType: OrderType;
  timeInForce: TimeInForce;
  limitPrice: string | null;
  stopPrice: string | null;
  filledAt: number | null;
  triggeredAt: number | null;
  reason: string | null;
  canCancel: boolean;
};
export type Settlement = {
  symbol: Symbol;
  quantity: string;
  price: string;
  proceeds: string;
};
export type Event = { second: number; message: string };
export type ResourceInflow = {
  asset: Symbol;
  quantity: string;
  valueAtCollection: string;
  second: number;
};
export type Result = {
  positionCloses?: PositionClose[];
  liquidations?: Liquidation[];
  passed: boolean;
  practice: boolean;
  cashChange: string;
  portfolioValueChange: string;
  settlements: Settlement[];
  completedAt: string;
  reason: "deadline" | "fast-forward" | "developer";
  requirementSummary: string;
  resourceInflows: ResourceInflow[];
};
export type Lesson = {
  group?: MarketGroup;
  positions?: PositionView[];
  comparison?: Comparison;
  liquidations?: Liquidation[];
  marginRejection?: MarginRejection | null;
  sharedFundsExample?: { symbol: Symbol; quantity: string } | null;
  id: string;
  variantId: string;
  lessonId: LessonId;
  lessonTitle: string;
  title: string;
  startedAt: string;
  expiresAt: string;
  status: "active" | "ended";
  remainingSeconds: number;
  elapsedSeconds: number;
  assessment: "pending" | "passed" | "not-passed";
  practice: boolean;
  recommendedAsset: Symbol;
  defaultQuantity: string;
  completedScenarios: number;
  canFastForward: boolean;
  observation: {
    stage: "place-order" | "waiting" | "observe" | "review" | "ready" | "ended";
    secondsRemaining: number;
    message: string;
  };
  goals: { id: string; label: string; done: boolean }[];
  form: {
    assetRules?: Record<
      Symbol,
      { quantityDecimals: number; priceDecimals: number }
    >;
    products?: Product[];
    defaultProduct?: Product;
    leverages?: number[];
    defaultLeverage?: number;
    options: {
      id: string;
      label: string;
      orderType: OrderType;
      timeInForce: TimeInForce;
      showLimit: boolean;
      showStop: boolean;
    }[];
    defaultOptionId: string;
    orderTypes: OrderType[];
    timeInForce: TimeInForce[];
    defaultOrderType: OrderType;
    defaultTimeInForce: TimeInForce;
    guidance: string;
    defaults: {
      symbol: Symbol;
      side: "buy" | "sell";
      limitPrice: string;
      stopPrice: string;
    }[];
  };
  quotes: { symbol: Symbol; price: string; history: QuotePoint[] }[];
  wallet: WalletView;
  portfolioValueChange: string;
  orders: Order[];
  events: Event[];
  result: Result | null;
};
export type Report = {
  comparison?: Comparison;
  attemptId: string;
  title: string;
  variantId: string;
  lessonId: LessonId;
  practice: boolean;
  opening: WalletView;
  closing: WalletView;
  quotes: Lesson["quotes"];
  orders: Order[];
  events: Event[];
  result: Result;
};
export type VariantView = {
  id: string;
  title: string;
  recommendedAsset: Symbol;
  passed: boolean;
};
export type CourseLesson = {
  group: MarketGroup;
  id: LessonId;
  title: string;
  completed: number;
  unlocked: boolean;
  lockedReason: string | null;
  variants: VariantView[];
};
export type GeneratorView = {
  level?: number;
  asset: Symbol;
  earned: boolean;
  awardedAt: string | null;
  productionAvailable: boolean;
  stored: string;
  ratePerHour: string | null;
  capacity: string | null;
  canCollect: boolean;
  status: string;
};
export type MarketState = {
  lesson: Lesson | null;
  demoUsd: string;
  holdings: Holding[];
  completedScenarios: number;
  canUsePerpetuals: boolean;
  marketGroups: {
    id: MarketGroup;
    label: string;
    level: number;
    unlocked: boolean;
    lockedReason: string | null;
  }[];
  course: {
    variants: VariantView[];
    lessons: CourseLesson[];
    nextVariantId: string;
    gtcPrerequisitesMet: boolean;
    gtcAvailable: boolean;
    spotPrerequisitesMet: boolean;
    perpetualPrerequisitesMet: boolean;
    allComplete: boolean;
    totalCompletedScenarios: number;
  };
  generator: {
    earned: boolean;
    awardedAt: string | null;
    productionAvailable: boolean;
  };
  generators: GeneratorView[];
  reports: {
    attemptId: string;
    title: string;
    practice: boolean;
    passed: boolean;
  }[];
  confirmedIntentIds: string[];
};
