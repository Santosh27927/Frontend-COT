import { ASSET_RULES } from "../policy/catalog.ts";
import type {
  LessonId,
  Lesson,
  OrderType,
  TimeInForce,
} from "../../api/market-types.ts";
import type { Scenario } from "./scenarios.ts";
import { SCENARIOS } from "./scenarios.ts";
export const LESSONS: {
  id: LessonId;
  title: string;
  reward?: "ETC" | "SOL" | "BTC";
}[] = [
  { id: "market", title: "Market orders", reward: "ETC" },
  { id: "gtc", title: "GTC limit orders" },
  { id: "ioc-fok", title: "IOC and FOK" },
  { id: "stop-limit", title: "Stop-limit orders", reward: "BTC" },
  { id: "perp-direction", title: "Long and short at 1x" },
  { id: "perp-collateral", title: "Compare leverage · same collateral" },
  { id: "perp-size", title: "Compare leverage · same size" },
  { id: "perp-liquidation", title: "Isolated liquidation at 5x" },
  { id: "perp-gtc", title: "Perpetual GTC limits" },
  { id: "perp-ioc-fok", title: "Perpetual IOC and FOK" },
  { id: "perp-stop", title: "Perpetual stop-limit" },
  { id: "combined", title: "Spot and margin · one wallet" },
];
export const groupOf = (id: LessonId) =>
  id === "combined"
    ? ("combined" as const)
    : id.startsWith("perp-")
      ? ("perpetual" as const)
      : ("spot" as const);
export const topicOf = (
  id: LessonId,
): "market" | "gtc" | "ioc-fok" | "stop-limit" =>
  id === "perp-gtc"
    ? "gtc"
    : id === "perp-ioc-fok"
      ? "ioc-fok"
      : id === "perp-stop"
        ? "stop-limit"
        : groupOf(id) !== "spot"
          ? "market"
          : (id as "market" | "gtc" | "ioc-fok" | "stop-limit");
export const lessonOf = (s: Scenario): LessonId => s.lessonId ?? "market";
export const ALL_SCENARIOS: Scenario[] = LESSONS.flatMap((l) =>
  SCENARIOS.map((s, i) => ({
    ...structuredClone(s),
    id:
      l.id === "market" ? s.id : `${l.id}-${s.recommendedAsset.toLowerCase()}`,
    lessonId: l.id,
    title: l.id === "market" ? s.title : `${l.title} · example ${i + 1}`,
  })),
);
export function goalDefinitions(id: LessonId): { id: string; label: string }[] {
  if (id === "perp-direction")
    return [
      { id: "long", label: "Open a long at 1x" },
      { id: "short", label: "Open a short at 1x" },
    ];
  if (id === "perp-collateral" || id === "perp-size")
    return [
      { id: "baseline", label: "Open the 1x baseline" },
      {
        id: "closed",
        label: "Fully close the baseline with an explicit close",
      },
      {
        id: "paired",
        label:
          id === "perp-collateral"
            ? "Open matching 2x using the same collateral target"
            : "Open matching 2x with the same contract quantity",
      },
    ];
  if (id === "perp-liquidation")
    return [
      { id: "liquidation", label: "Observe an actual 5x isolated liquidation" },
    ];
  if (id === "combined")
    return [
      { id: "margin", label: "Commit isolated margin" },
      {
        id: "rejection",
        label: "Experience a spot buy rejected because margin is committed",
      },
      { id: "correction", label: "Then fill an affordable spot buy" },
    ];
  if (groupOf(id) === "perpetual")
    return goalDefinitions(topicOf(id)).map((g) => ({
      ...g,
      label: `${g.label} in perpetuals`,
    }));
  return id === "market"
    ? [{ id: "trade", label: "Fill one market buy or sell" }]
    : id === "gtc"
      ? [{ id: "waiting", label: "See a GTC limit order wait, then fill" }]
      : id === "ioc-fok"
        ? [
            { id: "ioc", label: "Fill a limit IOC order immediately" },
            { id: "fok", label: "Fill a limit FOK order immediately" },
          ]
        : [
            {
              id: "stop",
              label: "See a dormant stop trigger, then its limit order fill",
            },
          ];
}
export function formDefinition(
  lessonId: LessonId,
): Omit<Lesson["form"], "defaults"> {
  const id = topicOf(lessonId),
    group = groupOf(lessonId);
  const orderTypes: OrderType[] =
    id === "market"
      ? ["MARKET"]
      : id === "stop-limit"
        ? ["STOP_LIMIT", "LIMIT", "MARKET"]
        : ["LIMIT", "MARKET"];
  const timeInForce: TimeInForce[] =
    id === "ioc-fok"
      ? ["IOC", "FOK"]
      : id === "market"
        ? ["IOC"]
        : ["GTC", "IOC"];
  const options = orderTypes.flatMap((orderType) =>
    timeInForce
      .filter((t) => orderType !== "MARKET" || t === "IOC")
      .filter((t) => orderType !== "STOP_LIMIT" || t === "GTC")
      .map((timeInForce) => ({
        id: `${orderType}:${timeInForce}`,
        label: `${orderType === "STOP_LIMIT" ? "Stop-limit" : orderType === "MARKET" ? "Market" : "Limit"} · ${timeInForce}`,
        orderType,
        timeInForce,
        showLimit: orderType !== "MARKET",
        showStop: orderType === "STOP_LIMIT",
      })),
  );
  return {
    assetRules: {
      ETC: ASSET_RULES.ETC,
      SOL: ASSET_RULES.SOL,
      BTC: ASSET_RULES.BTC,
    },
    products:
      group === "combined"
        ? ["perpetual", "spot"]
        : group === "perpetual"
          ? ["perpetual"]
          : ["spot"],
    defaultProduct: group === "spot" ? "spot" : "perpetual",
    leverages:
      lessonId === "perp-direction"
        ? [1]
        : lessonId === "perp-collateral" || lessonId === "perp-size"
          ? [1, 2]
          : lessonId === "perp-liquidation"
            ? [5]
            : [1, 2, 5],
    defaultLeverage:
      lessonId === "perp-liquidation" ? 5 : group === "combined" ? 2 : 1,
    options,
    defaultOptionId: options[0].id,
    orderTypes,
    timeInForce,
    defaultOrderType: orderTypes[0],
    defaultTimeInForce: timeInForce[0],
    guidance:
      lessonId === "perp-direction"
        ? "Open a long and a short at 1x. Use different assets together, or explicitly close before reversing the same asset. Notional is exposure, not owned spot assets."
        : lessonId === "perp-collateral" || lessonId === "perp-size"
          ? "Open 1x, close that position explicitly, then use the service's comparison quantity to open 2x on the same asset and direction. Other valid trades are allowed but do not complete this controlled comparison."
          : lessonId === "perp-liquidation"
            ? "Open 5x and observe the order-relative adverse path. Liquidation charges only that position's collateral; a gap backstop is a training rule, not an exchange guarantee."
            : lessonId === "combined"
              ? "Commit perpetual margin, try a spot buy that would fit your cash without that margin, then place an affordable spot buy. You may reduce the quantity or release margin to correct it."
              : id === "market"
                ? "Market orders fill immediately. Observe prices for 60 seconds and review for 20 seconds."
                : id === "gtc"
                  ? "Use the suggested limit to see a pending order fill60 seconds after acceptance. An immediate fill does not demonstrate waiting."
                  : id === "ioc-fok"
                    ? "Fill both IOC and FOK limit orders. Each acts immediately: fill if matchable, otherwise cancel. Liquidity is unlimited here; partial fills are not simulated."
                    : "Use the suggested stop and limit to see placement, activation at+30 seconds, then fill at+60. A trigger alone is not a fill.",
  };
}
