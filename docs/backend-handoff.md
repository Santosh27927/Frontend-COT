# COT backend handoff

This is the current contract for the browser simulation. All business decisions execute in Node under `src/mocks/`; React sends player intent and renders returned state. Being in the frontend repository does not make these modules browser logic. The Go repository was not changed. The selected decision/configuration/edge-case plan is preserved in the [historical planning archive](planning/phase-5-11/README.md). See the [current checkpoint](project-checkpoint.md) for all phases, exclusions and pending limitations.

## Data flow and responsibilities

`Component → api/client.ts → api/mock route → handler.ts → DemoStore → MarketBook/EconomyBook/ResourceBook → durable snapshot + receipt → PlayerState → component`.

Use the responsibility-by-responsibility rationale in [client responsibilities](client-responsibilities.md). Browser-only behavior is input/caret feedback, unsent selection, navigation/focus/layout, local timestamp formatting and uncertain-delivery identity. The backend independently validates every consequential value, selects identity, computes amounts, grades answers and authorizes every action. A disabled button is never a permission check.

The executable wire contract is `src/api/{types,market-types,economy-types}.ts`. Decimal amounts are strings. Error responses are `{error:{code,message,details?}}`; only the strict insufficient-order-funds schema includes details. No PIN, token, raw snapshot or another account's identifiers appear in errors.

## Selected game rules

- One active signed-in session. Validate credentials before revoking the previous token. Polling never takes control. Previous different-device token receives SESSION_REPLACED/401; ordinary logout/same-device rotation uses SESSION_REMOVED/401. No normal device-status badge.
- Continuing 1,000 USD starting allocation once. No per-lesson wallet refill. Three scenarios per lesson: twelve spot, twenty-one perpetual and three combined. Spot completion unlocks perpetual learning and converter independently of Town Hall payment.
- Scenario clock defaults to 180 seconds. Guided GTC fill is acceptance-relative +60 seconds; stop activates +30 then fills +60. Market/IOC/FOK execute immediately according to their matching policy. Observation/Fast-forward waits at least acceptance+80 and actual required outcome+20. Trading evidence can pass at the deadline even if observation runs out. A late unfilled required order does not pass. Practice is isolated and cannot change real funds, marks, progress or rewards.
- Spot sales consume lesson purchases first. Scenario end sells only their remainder; originally owned assets remain owned. Perpetual closes realize PnL to Demo USD. Owned assets retain their quantities and fluctuate in value. A single asset cannot have simultaneous opposing directions/leverage positions; close before reversing. Both long/short and both actual 1x-close-2x comparisons remain required in their lessons.
- New conversion, collection, upgrades/cancellation, pending claims, questions and assistance happen between real/practice demonstrations. Due accepted fills, production, settlement and construction still reconcile automatically. An old successful receipt replay is recovery and remains allowed.
- Exactly ETC/BTC collectors. Market lesson completion awards ETC once; spot stop-limit completion awards BTC once. GTC does not award a third collector.

## Exact units and preservation

| Value                     | Representation                                             |
| ------------------------- | ---------------------------------------------------------- |
| USD                       | Integer atoms at 12 decimals                               |
| Crypto internal quantity  | Integer atoms at 8 decimals                                |
| ETC/SOL accepted quantity | At most 6 decimals, internal multiples of 100              |
| BTC accepted quantity     | At most 8 decimals                                         |
| Internal price            | Integer at 6 decimals                                      |
| ETC/SOL accepted price    | At most 6 decimals                                         |
| BTC accepted price        | At most 4 decimals, tick 0.0001                            |
| Owed entitlement          | Reduced rational number of the asset's internal atoms, n/d |

Accepted quantity decimals + price decimals never exceed 12. One satoshi × 58639.4050 is exactly 0.000586394050 USD; a supplied BTC price of 58639.405001 rejects before effects. Generated marks/defaults align to the asset's tick. Do not reuse a displayed weighted entry price as an authoritative order price. Never use binary floating-point money. Structural precision changes require an explicit schema migration, not a runtime reinterpretation.

Wallet caps: USD 2,000, ETC 350, SOL 20; BTC's gameplay cap is explicitly unlimited. DTO `capacityKind` distinguishes this; internal policy requires an explicit `BTC:null`, never an absent field. Technical numeric bounds remain. Combined portfolio value can exceed 2,000. Caps stay in fixed units when prices move.

Optional spot buys reserve incoming capacity while pending; previews include headroom and funds. Optional buy/conversion must fully fit or reject before effects. Cancellation releases a pending buy's headroom. Collection transfers the lesser of collectible units and wallet room, leaving the rest stored. A lowered policy cap does not confiscate already owned units.

Cash proceeds/PnL/refunds/rewards that exceed capacity become owned, unspendable pending credits. Fractional entitlements also remain owed. Asset pools combine fractions across origins: two half-atoms can become one claimable atom. Claims transfer only whole valid units that currently fit, allocate FIFO by persisted origin sequence and preserve rational allocation records. Claiming is not another profit, gift or bonus. Trading reports include earned overflow in original PnL; later claim does not add PnL.

## Converter

Unlock after all twelve spot scenarios; first use is eligible immediately. The player chooses two different supported assets, with no amount field. Require available source value ≥50 USD. The service quotes a nearest representable source amount at or below nominal 50, discloses actual value and returns rounding change. Zero fees; reject any zero output. Require full destination room including the exact bonus entitlement.

For source debit D, its quoted USD value V, and the floored destination base quantity B: return source-value change V−value(B), then grant bonus B/4 in the destination asset. Whole units credit immediately, exact fractions remain owed. Base is valued using the same binding price snapshot. Example synthetic 3 USD/BTC: 50 USD conversion produces 16.66666666 BTC base, 0.00000002 USD change and 4.166666665 BTC bonus; the half-satoshi bonus remainder stays owed. No rounding value disappears or is silently charged as a fee.

Owned quotes bind for 30 seconds. Preview reserves no funds. Confirmation atomically rechecks current funds/headroom/unlock/manual-action gate, debits source, credits base+bonus/change, consumes the quote and records receipt/cooldown. All conversion is blocked for 172,800 seconds after success, including unbonused conversion. Exact cooldown endpoint is eligible. Failures/previews do not consume it; original successful intent replays after expiry without another conversion.

## Production and construction

| Building      | Level 1                   | Level 2                  | Cost/time for 1→2                                                              |
| ------------- | ------------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| Town Hall     | Level 1                   | Collector level 2 access | 100 USD equivalent in ONE USD/ETC/SOL/BTC asset, 12h, after twelve spot passes |
| ETC collector | 1 ETC/h, store 50         | 2 ETC/h, store 100       | 0.001 BTC, 12h, requires Town Hall 2                                           |
| BTC collector | 0.0001 BTC/h, store 0.005 | 0.0002 BTC/h, store 0.01 | 10 ETC, 12h, requires Town Hall 2                                              |

Each store holds 50 hours of its level's production. Full-store elapsed time is discarded, never backfilled. Integer millisecond accrual retains sub-unit fractions between frequent collections. Old rate/store continues during construction; accepted new effects apply at actual completion, including offline intervals.

Quote cost, duration, original payment units, refund ratio and target production effect are stored with the accepted construction. Later price/policy changes cannot reprice or restart it. Twenty concurrent slots are configured at Town Hall 1/2, one active per building; the three-building prototype cannot naturally use twenty, so slot boundaries need explicit development fixtures. No extra building copies were introduced.

No mixed payment, automatic sale or automatic conversion. User plans the separate converter action and its cooldown. Cancellation requires an owned exact preview and `acknowledged:true`; it returns half the ORIGINAL paid units in the ORIGINAL asset. Odd fractions and full-wallet excess remain pending. At completion timestamp, completion wins over a new cancellation. Restart uses fresh full cost, timer and construction identity; old quote/receipt/event cannot mutate it.

## Optional questions and assistance

The twelve approved server-owned questions are in `src/mocks/economy/questions.json`. Public ungraded payloads expose prompt/choices/revision, not the answer key. Questions unlock after that lesson's three scenarios; they are optional and never gate a pass or Fast-forward. A valid wrong answer increments accepted attempts once, returns explanation and costs nothing. A stale revision/invalid payload/network replay does not create another graded attempt.

First correct completion pays 5 USD on attempt one, or 2.50 on any later attempt. Unlimited retries never reduce it below 2.50. Later paid repeats/practice/text changes/logout/restart do not pay again. Grading, accepted count, reward-or-pending and paid identity commit together. Correct answer and Explanation render separately. Stable question ID preserves attempts across content revision.

Assistance is a claimable EXTRA 100 USD when cash is strictly below 50 and usable recovery routes have been checked. Twenty becomes 120; exact fifty is ineligible. Check pending claims, collectible resources and actually usable converter recovery; merely reserving cash cannot manufacture poverty. Active demonstrations block the claim, so current trading reserves/margin must resolve normally first. No forced sale/close. Unknown/failed recovery reads are errors, not zero balances.

Assistance has an owned, single-use policy-bound offer ID and revalidates funds/recovery at claim. Cadence/repeat values are deliberately pending testing; ordinary unconfigured policy offers nothing. `COT_ASSISTANCE_FIXTURE=once` is nonproduction-only and allows at most one grant per test player. Its claim count persists. This is not a universal minimum trade rule.

## HTTP and click map

All player reads/actions require the current Bearer token except sign-in. A different player's quote/order/construction/receipt is inaccessible. Shared handler rejects unexpected fields and oversized bodies. Routes delegate; they contain no financial engine.

| Player interaction                        | Request                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| Sign in / restore / sign out              | POST sign-in `{username,pin,deviceId}`, GET state, POST sign-out                |
| Learn / order / finish / cancel / collect | POST command with existing CoreCommand and stable intentId; see market-types.ts |
| Read order limit/current funds            | POST order-preview with OrderDraft                                              |
| Read frozen replay                        | GET report?attemptId=owned-id                                                   |
| Review converter                          | POST quote `{kind:"conversion",source,destination}`                             |
| Review upgrade                            | POST quote `{kind:"upgrade",building,paymentAsset}`                             |
| Review cancellation                       | POST quote `{kind:"cancellation",constructionId}`                               |
| Confirm conversion/upgrade                | POST command with action `convert` or `upgrade`, `intentId` and `quoteId`          |
| Cancel acknowledged construction          | POST command `{action:"cancel-upgrade",intentId,quoteId,acknowledged:true}`     |
| Claim pending pool                        | POST command `{action:"claim-credit",intentId,asset}`                           |
| Submit optional answer                    | POST command `{action:"answer",intentId,questionId,questionRevision,answer}`    |
| Claim help                                | POST command `{action:"claim-assistance",intentId,offerId}`                     |
| Page activity                             | GET history?limit=20&cursor=last-item-id                                        |

All paths above are under `/api/mock/`. Read-only catalog/wallet/economy/policy projections and named conversion-quote/upgrade-quote/cancellation-quote adapters also exist. Unified `quote` is the actual UI path. These mock interfaces are proposed integration contracts, not claims that the Go endpoints exist. Command confirmation returns original receipt, replayed flag and current PlayerState.

Relevant safe errors include QUOTE_EXPIRED, QUOTE_NOT_FOUND, INVALID_CONVERSION, CONVERSION_COOLDOWN, DESTINATION_STORAGE_FULL, UPGRADE_LOCKED, CONSTRUCTION_EXISTS, CONSTRUCTION_SLOTS_FULL, ACKNOWLEDGEMENT_REQUIRED, QUESTION_STALE, ASSISTANCE_UNAVAILABLE, ACTIVE_DEMONSTRATION, IDEMPOTENCY_KEY_CONFLICT and STORE_UNAVAILABLE. The shared errors.ts defines exact statuses. The browser displays the returned reason; it does not replace a failed read with a financial default.

Development-only reset/advance/resource/world/policy-migrate/export routes require loopback/same-origin validation and are unavailable in production. Export contains fake credentials/session data and must remain private; do not print it in logs. Real deployment must remove the mock layer entirely.

## Transaction, storage and runtime configuration

Common intent receipts are scoped to player and canonical payload across market AND village actions. Authenticate, reconcile/persist already due events, check original receipt, then validate a NEW action. Original receipt replay precedes new quote/time/funds/manual-action checks. Conflicting reuse rejects; a new key cannot reuse a consumed quote/offer. Persist effects + receipt before confirming. Browser saves the stable command before send and retries it unchanged after uncertain delivery.

Local schema-5 snapshot persists exact BigInt/Map/Set/rational data, owner sessions, wallet, market/production state, question counts, quotes, construction and receipts. The codec is internal only. Atomic temporary write/fsync/rename, checksum CAS and local lock fail cleanly on another writer. Failed writes roll back unpublished memory; ambiguous post-rename fsync failures retain committed memory and report uncertainty for receipt recovery. Missing previously initialized/corrupt/incompatible state never silently resets. Explicit developer reset archives prior data; the selected asset cutover was backed up and deliberately reset, never renamed 1:1.

`src/mocks/policy/defaults.json` contains editable versioned settings; `COT_POLICY_FILE` overrides its path. Invalid reload keeps last validated policy with a development warning; absent initial valid policy fails closed. Publish a new version. Accepted operations freeze relevant terms. Existing collector settings are frozen until an explicit expected-version, acknowledged dev-policy-migrate effective time. Lower capacities preserve stored units and pause further accrual until room exists. Future staff editing requires authorization/audit/preview/rollback; it is not included here.

## Logical records for the real backend

| Logical record                       | Relationship/invariant                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| Player/session/progress              | One current token, continuing allocation, distinct scenario passes                  |
| Asset/policy/market state            | Structural scales, fixed/unlimited caps, accepted policy references, coherent marks |
| Wallet/reservation/incoming headroom | Owned funds, margin and pending capacity cannot be spent twice                      |
| Receipt/operation                    | Unique player+intent, canonical payload and immutable original result               |
| Conversion quote/cooldown            | Owned binding single-use terms, atomic money/bonus/change/cooldown                  |
| Collector production intervals       | Award/level/settings/effective timestamp, fraction/store and no-backfill            |
| Construction/cancellation            | Original units/time/effect/refund, stable identity and terminal outcome             |
| Owed credit/claim allocations        | Exact rational asset pools with origin and FIFO preservation                        |
| Question/attempt/reward              | Stable question ID, served revision, accepted count and paid identity               |
| Assistance policy/offer/claim        | Configured repeat policy, ownership, eligibility and single-use grant               |
| Lesson/report/events                 | Chronological required evidence, practice isolation and frozen original report      |

These are logical responsibilities, not an instruction to create one database table per screen. Go must choose database transactions, constraints/indexes, locks and workers; validate real process/DB failure and concurrency. Mock tests do not close existing Go audit defects. Reconcile earlier session-funding/finish/goal assumptions before integration. Production identity, secret/token storage, expiry, authorization, real market/Phoenix behavior, remote prices and live settlement remain separate work.

See [test evidence](test-evidence.md) for actual execution and [platform handoff](platform-handoff.md) for unverified Android/iOS work. No implementation/test count proves absence of further edge cases.

The durable snapshot also retains immutable policy-version fingerprints and terminal construction archives. A cold restart rejects a reused policy ID with different contents. Canceling/completing removes a job from active slots but preserves its original paid units, accepted effects/refund terms, start/finish, terminal outcome and cancellation refund attribution. A later replacement has a separate record. Global production migration reconciles every owner's offline completions before applying the new interval.

Writer locks contain complete process ownership records published atomically. Restart can recover an owner confirmed dead by the OS, including a process killed after commit and before reply, and can recover a killed recovery process. It never steals a live/unknown/permission-denied/reused-PID lock. Unknown ownership requires explicit investigation. These are tested local filesystem behaviors, not a distributed-lock or real-database guarantee.
