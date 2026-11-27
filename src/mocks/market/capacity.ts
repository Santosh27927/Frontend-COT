import type { Execution } from "./execution.ts";
import type { Symbol } from "../../api/market-types.ts";
import { getPolicy } from "../policy/service.ts";
import { parseUnits, quantity, checked } from "./exact.ts";
export function cashCredit(
  e: Pick<Execution, "wallet" | "overflowCash">,
  amount: bigint,
) {
  if (amount <= 0n) {
    e.wallet.cash = checked(e.wallet.cash + amount);
    return;
  }
  const cap = parseUnits(getPolicy().walletCaps.USD, 12),
    free = cap > e.wallet.cash ? cap - e.wallet.cash : 0n,
    immediate = amount < free ? amount : free;
  e.wallet.cash = checked(e.wallet.cash + immediate);
  e.overflowCash = (e.overflowCash ?? 0n) + amount - immediate;
}
export function incomingRoom(
  e: Pick<Execution, "wallet" | "orders">,
  asset: Symbol,
) {
  const cap = getPolicy().walletCaps[asset];
  if (cap === null) return 9223372036854775807n - e.wallet.quantities[asset];
  const reserved = e.orders
    .filter(
      (o) =>
        o.view.symbol === asset &&
        o.view.product !== "perpetual" &&
        o.view.side === "buy" &&
        (o.view.status === "PENDING" || o.view.status === "TRIGGERED"),
    )
    .reduce((s, o) => s + o.q, 0n);
  const free = quantity(cap, asset) - e.wallet.quantities[asset] - reserved;
  return free > 0n ? free : 0n;
}
