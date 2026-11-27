> Historical phase slice. The current [backend handoff](backend-handoff.md) and [phase 5–11 guide](phase-5-11.md) supersede old asset names, collector settings, in-memory persistence and economy assumptions below.

> Historical Phase2 scope. Phase3 now implements later spot lessons, order limits and XRP production/collection. See [Phase3](phase-3.md) and the current [backend handoff](backend-handoff.md).

# Phase 2: market lesson and backend handoff

This is a local, player-facing browser prototype. It works without Go, a database, a price provider or an exchange SDK. Nothing here changes Backend-COT. The mock API below is a proposed interface for testing the selected behavior, not an assertion that the existing Go API implements it.

## Try the lesson

1. Sign in with `learner / 0073`; open the first lesson.
2. Buy 5 XRP. It fills immediately at the current scripted quote. A sell also meets the goal if you own enough of that asset. Spot cannot open a short.
3. Watch prices change every 30 seconds. The first accepted order starts 60 seconds of observation and 20 seconds of review. Optional extra orders do not reset that interval.
4. Fast-forward is hidden until that interval finishes. It jumps to the scenario endpoint and closes only the remaining lesson purchases. Otherwise the scenario ends at its original three-minute deadline.
5. View the result and read-only replay. Complete the three different example paths for three credits; repeating a passed path automatically becomes isolated practice.

Developer tools can advance the current lesson by20/60 seconds or finish its clock. Those controls never advance real time or resource production. They are absent in production mode, as are their routes. Use them to inspect checkpoints quickly; also test normal elapsed time on Android before moving on.

Market fills are immediate. A displayed 60-second pending market order would teach the wrong execution behavior. Limit/IOC/FOK/stop examples come later with separate truthful order states.

A successful trade at170 seconds still passes when the deadline arrives. Full observation is required only to unlock Fast-forward, not to pass. A trade immediately before180 seconds is accepted; one at or after180 is rejected. No trade means no pass. Background/reconnect time counts. A lesson is never extended to fit a late trade.

## What each layer owns

| Layer               | Files                                                   | Responsibility                                                                                    |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Shared views        | `src/api/market-types.ts`, `types.ts`                   | Decimal strings, commands, capabilities, results and reports                                      |
| Transport           | `src/api/client.ts`                                     | Requests, typed errors, snapshot ordering                                                         |
| Identity controller | `features/identity/PlayerApp.tsx`                       | Session generation, immediate revocation handling, navigation, adopting server snapshots          |
| Command delivery    | `features/trading/useLessonCommands.ts`                 | Save stable intent before sending; recover/retry identical uncertain commands                     |
| Display             | `LessonScreen.tsx`, `PriceChart.tsx`, `ReplayPanel.tsx` | Forms and rendering returned capabilities/data; no money or progression rules                     |
| Auth adapter        | `mocks/store.ts`, `handler.ts`                          | Current-player ownership, HTTP body shape, safe errors                                            |
| Simulator           | `mocks/market/book.ts`                                  | Exact execution, observation, settlement, distinct progress, isolated practice, immutable reports |
| Numeric boundary    | `mocks/market/exact.ts`                                 | BigInt quantity/price6, cash12, checked int64-scale bounds                                        |
| Teaching fixtures   | `mocks/market/scenarios.ts`                             | Private versioned price paths and suggested form defaults                                         |

To learn/debug: follow a buy click → `delivery.send` → `api.command` → command route → handler → authenticated store → MarketBook → returned state → `adopt` → screen. Change a fixture to explore a price path; change a transition to explore a rule. Do not put those rules in the button handler. Browser UI state is limited to selected tab/asset/side, quantity text, report selection and delivery status.

## Proposed actions and data flow

All authenticated actions require the sole current bearer token; caller-supplied player IDs cannot select another account. Responses are no-store. No caller price, balance, timestamp, pass, practice, reward or owner flags are accepted.

| Click/action             | Request                                                               | Server decision/effect                                                                                                                            | Returned data                                                    |
| ------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| New scenario             | `POST /api/mock/command` `{action:"start",intentId,variantId?}`       | Resume active same variant or create new attempt with immutable opening wallet/path; completed variant becomes practice                           | `{state,receipt,replayed}`                                       |
| Open/resume known lesson | No write; navigate to Learn                                           | Poll returns existing attempt and original deadline                                                                                               | State                                                            |
| Buy/sell                 | Same route `{action:"order",intentId,attemptId,symbol,side,quantity}` | Validate exact quantity, funds/asset, deadline and256-order bound; fill immediately at acceptance quote; lesson purchases consumed first on sells | Filled order, cash/holdings, observation stage, original receipt |
| Fast-forward             | Same route `{action:"finish",intentId,attemptId}`                     | Recheck required trade and80-second gate, settle at180-second endpoint once                                                                       | Frozen result, progress, receipt                                 |
| Replay                   | `GET /api/mock/report?attemptId=...`                                  | Current owner only, completed report only; foreign/missing both404                                                                                | Frozen report with past quotes and events                        |
| Developer advance        | `POST /api/mock/dev-advance` `{attemptId,seconds}`                    | Current owner/current attempt; integer1–180; test offset only; production404                                                                      | Updated state                                                    |

`POST /api/mock/start-lesson` remains an alias with `{intentId,variantId?}`. It delegates to the same receipt ledger. Empty/keyless bodies reject. UI starts use the shared delivery hook, including the Village button. Same-key retries after expiry confirm the original start; they cannot silently start a new attempt.

State includes persistent Demo USD/holdings, lesson working wallet, course variants/credits, unavailable-feature flags, award marker, report summaries and confirmed intent IDs. Active quote history contains current/past data only. Server-computed chart coordinates use integer ratios; converting a bounded dimensionless coordinate to a JS number does not convert money to floating point. Replay exposes the full script only after completion.

## Exact wallet and settlement example

User-selected rule: sell lesson purchases first. Starting with1000 Demo USD and20 XRP at$2, buy5; sell3 at$3; close the remaining2 lesson XRP at$3. End with1005 Demo USD and20 XRP. Cash movement is+$5. Marked portfolio value change is+$25 because the preserved20 XRP also increased in value. These are separate report labels, not a cost-basis/tax realized-profit calculation. Do not add profit to sale proceeds a second time.

All monetary API values are decimal strings. Quantity and price allow up to6 decimal places; their product has12. Use exact scaled integers/decimals in the real backend too, with checked range/overflow. Zero fee/slippage/funding and unlimited liquidity match the existing COT market baseline. No real venue accuracy is claimed.

Buying/selling during a real attempt updates the continuing wallet. End-of-lesson settlement sells only still-owned lesson purchases; it does not liquidate unrelated prior assets or restore prior assets intentionally sold. A new lesson/sign-in never grants a fresh allocation. Practice clones the original successful attempt's opening wallet and path; changes/results never alter the persistent wallet, distinct credits or rewards. Read-only replay never executes trades.

## Delivery, identity and failures

Intent keys:8–128 ASCII letters/digits/`._:-`. Successful receipts are scoped to player and exact canonical command payload. Repeating the same key/payload returns the original receipt and current state, even after another attempt starts. A changed payload conflicts. Rejected commands create no command financial effects; independent scheduled expiry can still occur.

Save a pending command in tab session storage keyed by player before sending. Network/5xx errors are uncertain, not rejections: block edits/new commands, retain original key/payload, offer Retry original command, reconcile confirmed keys from state. Double taps are blocked synchronously. Storage save failure prevents sending. Conditional removal cannot erase a later intent. Another account never inherits the pending command.

Every command/report/developer-clock response also handles removed/replaced authentication immediately; it does not depend on a successful state refresh. Older-context responses cannot restore auth or overwrite a newer player snapshot. Exactly one signed-in device remains the selected policy; normal screens show no device diagnostics. Offline revocation is detected when connectivity returns.

| Code                               | HTTP | Meaning                                                                     |
| ---------------------------------- | ---- | --------------------------------------------------------------------------- |
| INVALID_COMMAND                    | 400  | Unsupported fields, numeric bounds/type, missing key, excessive order count |
| INSUFFICIENT_AVAILABLE_FUNDS       | 409  | Not enough cash or owned asset                                              |
| SESSION_COMPLETED                  | 409  | New action after deadline/completion                                        |
| ACTIVE_SESSION_EXISTS              | 409  | Another scenario is active                                                  |
| FAST_FORWARD_NOT_READY             | 409  | Trading/observation requirement unmet                                       |
| IDEMPOTENCY_KEY_CONFLICT           | 409  | Key reused with different payload                                           |
| NOT_FOUND                          | 404  | Unavailable scenario/attempt/owned completed report                         |
| SESSION_REPLACED / SESSION_REMOVED | 401  | Current authentication ended; clear local session immediately               |
| DEMO_ERROR                         | 500  | Generic unknown failure; delivery may be uncertain                          |

## Backend work to implement later

Use the simulator behavior and tests as a behavioral reference, not a prescribed SQL schema. Durable implementation needs these logical records and transactions:

- Player portfolio and exact asset quantities; one initial allocation event, a balance/asset ledger with auditable fills and targeted settlement entries.
- Player-owned attempt with original start/deadline, immutable scenario version and opening snapshot, first accepted required action, purchased-quantity attribution and completion result.
- Atomic current-session revocation and owner checks, as documented in the Phase1 contract.
- Player+intent receipt with canonical payload binding, effect and original response identity; persist atomically with each successful mutation. Concurrent duplicates must resolve to one effect.
- Completion transaction that checks attempt status, settles once, freezes report, credits one distinct variant and records a once-only reward. Reconnect and a durable worker must converge on the same outcome.
- Three stable distinct scenario credits, separate practice attempts and immutable owner-scoped reports. Define durable retention explicitly; this mock keeps all temporary reports.
- Trusted time and price/scenario snapshots. Developer offsets cannot exist in player commands or advance production clocks.

Existing COT Go references agree on immediate market fills, precision6/12, zero fees and256 orders. Integration gaps to resolve deliberately: Go currently requires buy AND sell whereas the selected lesson requires OR; its session funding/settlement need a continuing portfolio and lesson-only attribution; the80-second observation policy and three distinct authored paths are new. Do not assume these mock URLs already exist in Go. No backend files were edited here.

## What is still unavailable or undecided

Phase2 implements only the first market-order lesson. GTC/IOC/FOK/stop, perpetuals/leverage/liquidation, shared margin, conversion/bonus, generator production/collection, upgrades and emergency assistance remain later work. Three market passes award the XRP generator marker once; collection is explicitly unavailable until Phase3. GTC prerequisites can be met while GTC implementation remains unavailable. Perpetuals require the entire spot curriculum, not just this lesson.

Selected later generator settings:1 XRP/hour, capacity50. Other generator economics, emergency reward amount/frequency, final scenario prices, provider/SDK behavior and durable production/auth design remain pending. Conversion uses quoted values with the previously selected bonus policy; it is not simulated yet. Replay after reconnect is a test edge case, not an extra mandatory player exercise.

## Validation limits

Unit/HTTP tests use injected clocks, independent numeric examples and real handlers. Browser tests run Chrome at320/390/736 widths and exercise delivery failures, auth revocation, lesson/replay/practice and progress. These checks do not replace a physical Android browser run or a native build. Android verification is the next checkpoint before broader lessons.

Mock data lives only in one Node process. Schema version2 intentionally resets older temporary fixtures and requires a fresh sign-in; reset/restart also destroys all portfolios, receipts and reports. This is not a database migration, production authentication, durable recovery or a real-money trading service.
