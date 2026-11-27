import type { LessonId, Symbol } from "./market-types.ts";
export type Asset = Symbol | "USD";
export type Building = "town-hall" | "ETC" | "BTC";
export type EconomyCommand =
  | { action: "convert"; intentId: string; quoteId: string }
  | { action: "upgrade"; intentId: string; quoteId: string }
  | {
      action: "cancel-upgrade";
      intentId: string;
      quoteId: string;
      acknowledged: true;
    }
  | { action: "claim-credit"; intentId: string; asset: Asset }
  | {
      action: "answer";
      intentId: string;
      questionId: string;
      questionRevision: string;
      answer: string;
    }
  | { action: "claim-assistance"; intentId: string; offerId: string };
export type QuoteRequest =
  | { kind: "conversion"; source: Asset; destination: Asset }
  | { kind: "upgrade"; building: Building; paymentAsset: Asset }
  | { kind: "cancellation"; constructionId: string };
export type EconomyQuote = {
  id: string;
  kind: QuoteRequest["kind"];
  expiresAt: string;
  policyVersion: string;
  lines: string[];
  confirmation: string;
};
export type EconomyState = {
  policyVersion: string;
  learningLevel: number;
  townHallLevel: number;
  manualActionsAllowed: boolean;
  prices: { asset: Symbol; price: string; asOf: string }[];
  wallet: {
    asset: Asset;
    balance: string;
    capacity: string | null;
    capacityKind: "fixed" | "unlimited";
    free: string;
  }[];
  credits: {
    asset: Asset;
    claimable: string;
    owed: string;
    origins: number;
    canClaim: boolean;
    fractionalRemainder: boolean;
  }[];
  converter: {
    unlocked: boolean;
    available: boolean;
    reason: string;
    nextAt: string | null;
    principal: string;
    bonus: string;
  };
  buildings: {
    id: Building;
    label: string;
    level: number;
    canUpgrade: boolean;
    reason: string;
    paymentAssets: Asset[];
  }[];
  constructions: {
    id: string;
    building: Building;
    targetLevel: number;
    finishesAt: string;
    paid: string;
    asset: Asset;
    canCancel: boolean;
  }[];
  questions: {
    id: string;
    revision: string;
    lessonId: LessonId;
    prompt: string;
    options: { id: string; text: string }[];
    unlocked: boolean;
    attempts: number;
    paid: boolean;
    result: null | {
      correct: boolean;
      correctAnswer: string;
      explanation: string;
      reward: string;
    };
  }[];
  assistance: {
    offerId: string | null;
    available: boolean;
    reason: string;
    grant: string;
    policyStatus: string;
  };
  announcements: string[];
  history: { id: string; at: string; message: string }[];
};
