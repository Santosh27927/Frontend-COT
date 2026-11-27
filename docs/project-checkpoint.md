# COT frontend checkpoint: phases, decisions and limitations

Checkpoint date: **27 November 2026**. This is a local source checkpoint of the browser prototype and its **server-side Node mock backend**. It is not a production release or a native Android/iOS build. The mock domain implementation stays in this repository so the real backend can be developed against a visible, testable contract.

## Reading order and authority

1. This file: what was built, the current decisions, exclusions and pending work.
2. [Backend handoff](backend-handoff.md): detailed business rules, exact arithmetic, logical records, HTTP mapping, errors and transaction requirements.
3. [Client responsibilities](client-responsibilities.md): each browser responsibility and why it belongs there.
4. [Phases 5–11 review guide](phase-5-11.md), [test evidence](test-evidence.md) and [platform handoff](platform-handoff.md).
5. [Selected planning archive](planning/phase-5-11/README.md): complete selected Q&A register, configuration plan, edge cases, economy calculations and approved question content retained with their original status.

User decisions remain product authority. Current handoffs and executable types describe the implemented prototype; the preserved planning package is historical design evidence, not proof that a proposed module or test exists. Phase 1–4 documents preserve earlier slices and explicitly warn that old assets, resource settings and in-memory storage have been superseded. A mismatch with a selected requirement must be raised, not silently resolved in favor of code.

## Phase-by-phase delivery

| Phase | What this checkpoint contains | Detail and boundary |
| --- | --- | --- |
| 1 | Player sign-in, lowercase account-name feedback, exactly four ASCII PIN digits including leading zeroes, protected reads/commands, session replacement and developer-only test tools | [Phase 1](phase-1.md). Final session design is **one active signed-in session**, replacing the earlier three-device proposal. No ordinary device-status badge. Production identity is excluded. |
| 2 | Continuing wallet, first spot-market journey, service-owned timers/evidence, quantity validation, command delivery recovery, scenario result, settlement and frozen replay | [Phase 2](phase-2.md). Sales use lesson purchases first; original holdings are preserved. Practice cannot change real funds or progression. |
| 3 | Remaining spot GTC, IOC/FOK and stop-limit journeys, three scenarios per lesson, current simulated price, affordability/maximum preview, insufficient-funds feedback, reservations/cancellation and readable result states | [Phase 3](phase-3.md). Later catalog reset supersedes its old resource examples. Full current course has twelve spot scenarios and only ETC/BTC collectors. |
| 4 | Perpetual 1x long/short, separate same-collateral and same-position-size 1x/2x comparisons, 5x liquidation training, perpetual GTC, IOC/FOK, stop-limit and shared spot/margin practice | [Phase 4](phase-4.md). Twenty-one perpetual plus three combined scenarios; actual 1x-close-2x actions, not just a reference picture. |
| 5 | Source/destination-only converter, binding quote review, nominal $50 source value, exact base/bonus/change, 25% bonus, zero fees, expiry and 48-hour all-conversion lock | [Converter contract](backend-handoff.md#converter). Backend computes everything; quote preview reserves nothing. |
| 6 | ETC/BTC offline production, separate collector storage, Town Hall and collector level 1→2 construction, original-unit refund preview, acknowledged cancellation and paid restart | [Production and construction](backend-handoff.md#production-and-construction). Three buildings total; no extra copies or unspecified levels. |
| 7 | Fixed wallet caps, incoming headroom, protected pending credits/fractions, partial collection/claims, recovery checks and claimable assistance flow | [Exact units](backend-handoff.md#exact-units-and-preservation), [assistance](backend-handoff.md#optional-questions-and-assistance). Ordinary assistance frequency remains deliberately unconfigured. |
| 8 | Twelve optional knowledge checks, free unlimited wrong retries, stable attempt/reward identity, separate correct-answer and explanation blocks, landscape village and responsive light/dark rendering | Correct first accepted attempt pays 5 Demo USD; first correct answer on any later attempt pays 2.50, once. Questions do not gate lessons. Final design artwork is deferred. |
| 9 | Durable local mock snapshot, atomic effects/receipts, restart and failure recovery, validated versioned settings, API/data/ownership documentation and automated checks | [Transaction/storage/configuration](backend-handoff.md#transaction-storage-and-runtime-configuration). Single local writer, not a production database or distributed service. |
| 10–11 | Browser/mobile feasibility and Android-first/iOS-later integration handoff | [Platform handoff](platform-handoff.md). Documentation and feasibility only: no native project, APK/IPA, emulator/simulator execution, signing, store publication or final renderer decision. |

### Learning, trading and progression decisions

- **36 scenarios**: four spot lessons × three scenarios = twelve; seven perpetual lessons × three = twenty-one; combined practice × three = three. Each order family is taught separately. Required distinct scenario passes, not repeated rewards from replaying one completed scenario, unlock progression.
- All twelve spot passes finish Learning Level 1 and unlock perpetual learning and the converter. This is separate from the paid **Town Hall level**. Perpetual learning does not require paying for Town Hall 2.
- Three market passes award the ETC collector once. Three stop-limit passes complete spot learning and award the BTC collector once. SOL remains tradable/convertible but has **no collector**.
- Default scenario deadline: 180 seconds. Required-order observation is acceptance-relative, not lesson-start-relative. The review/Fast-forward gate waits at least acceptance +80 seconds and actual required outcome +20 seconds.
- An unmatched guided GTC order fills at acceptance +60 seconds; stop-limit triggers at +30 and fills at +60. Market and marketable GTC execute immediately. IOC/FOK retain their matching policies; they are not falsely left pending for a minute. The immediate-fill lessons still retain the observation gate.
- Deadline is hard: an outcome due exactly at the deadline reconciles before settlement; a required fill due later is canceled at the deadline and does not create passing evidence. If all trading requirements were completed, the deadline can still pass the scenario even if observation time was unavailable. Reconnect does not create a fresh deadline or require a separate learning task; reports preserve what occurred.
- Simulation is controlled, with a shared mock price stream and order book. It is not real market execution. Price, order status, reserved/available funds, maximum quantity, open positions, liquidation and result reasons come from the service.
- Real wallet starts with 1,000 Demo USD once. Lesson start does not refill it. Buy uses USD; sell uses available owned assets. A sell consumes newly bought lesson lots first. End settlement sells only those lots' remainder; pre-existing asset units stay owned. Realized PnL/cash proceeds settle to Demo USD; asset holdings remain exposed to price movement.
- One asset has one direction/leverage position at a time. Long and short evidence is required where specified; the player may use different assets or close before reversing the same asset. Both leverage comparison lessons require an actual 1x position, close, then corresponding 2x position. Liquidation learning deliberately exercises the scenario's service-owned adverse move/backstop.
- Shared-wallet practice demonstrates funds committed to margin, an unaffordable spot-order rejection and the required affordable correction. Preview/disabled controls explain availability; the service revalidates at execution.
- Completed scenarios run in an isolated practice wallet/market/report context. They cannot change real balances, marks, progression, building awards or paid rewards.
- New manual collection, conversion, construction/cancellation, credit claims, questions and assistance claims are blocked during **real and practice demonstrations**, even after navigating to the village. Already accepted fills, production, construction completion and settlement continue. Recovery of an original successful receipt is not a new action.

### Instruments, collectors and buildings

| Item | Selected behavior |
| --- | --- |
| Cash | **Demo USD**; the earlier “USDT” wording was corrected to USD. Starting cash 1,000; cash capacity 2,000. No real funds. |
| Instruments | ETC, SOL and BTC. Current catalog has no XRP or ETH. Asset quantities and prices cross the API as decimal strings. |
| Wallet capacity | ETC 350 units; SOL 20 units; BTC has explicitly unlimited **gameplay wallet** storage, subject to technical bounds. Combined portfolio value can exceed $2,000. Caps do not move with market prices. |
| ETC collector 1 | 1 ETC/hour; store 50 ETC, equivalent to 50 hours. Awarded after the three market scenarios. |
| ETC collector 2 | 2 ETC/hour; store 100. Requires Town Hall 2; upgrade pays **0.001 BTC**, takes 12 hours. |
| BTC collector 1 | 0.0001 BTC/hour; store 0.005 BTC, equivalent to 50 hours. Awarded after the three stop-limit scenarios. |
| BTC collector 2 | 0.0002 BTC/hour; store 0.01. Requires Town Hall 2; upgrade pays **10 ETC**, takes 12 hours. |
| Town Hall 1→2 | Complete all twelve spot scenarios; pay $100 equivalent in **one** supported payment asset; then wait 12 hours. Collector level 2 access applies on completion. |
| Construction slots | Town Hall 1 and 2 each configure 20 simultaneous jobs, maximum one per building. Only three buildings exist, so 20/21-slot boundaries require synthetic development fixtures. |

Collector store and wallet are separate. A full collector pauses production; time spent full is discarded rather than accumulated for later backfill. Partial collection transfers only what fits in the wallet and leaves the rest in the collector. Fractional accrual survives frequent collection. During upgrade, old production/storage remains until the accepted completion boundary; offline completion uses that same boundary.

One payment asset per construction: no mixed payment, forced asset sale or automatic conversion. Cancellation requires reviewing the exact original-asset refund and loss and explicitly acknowledging them. Refund is **50% of original paid units**, not a fresh USD valuation. Excess or fractions remain owed pending credit. At the exact completion time, completion wins over a new cancellation. Restart charges the full then-current cost, starts a new full timer and creates a new construction identity; old receipts cannot change it.

The earlier 5 ETH Town Hall proposal and three-collector/XRP/ETH examples are historical, not current defaults. The approved disposable catalog cutover was backed up and reset explicitly; no 1:1 asset rename/migration was represented as financially valid. Tuning values may change later through validated backend policy.

### Conversion and wallet preservation

- Player selects source and a different destination from USD/ETC/SOL/BTC. Same-asset conversion is rejected. There is **no editable conversion amount** and no partial-source shortcut when the player has less than $50 available source value.
- The service quotes the nearest supported source quantity at or below nominal $50, discloses its actual value, base destination, rounding change, 25% bonus, credited units and exact fractional entitlement. Zero fees; zero received-unit output rejects. Fractions/change are preserved rather than silently lost.
- Quote binds its price/terms for 30 seconds. Expiry requires another review. Price movement after conversion changes asset value; the quote dialog explains volatility before acceptance. Current prices are **simulated**, not a connected live-price provider.
- Confirmation rechecks owner, funds, unlocked state, manual-action gate, full destination capacity including bonus and unused valid quote. It commits debit, destination/change/bonus, receipt and cooldown atomically. A preview or failed confirmation consumes neither funds nor cooldown.
- A successful conversion blocks **all conversions for 48 hours**, including ordinary conversions without a bonus. Exact cooldown endpoint is eligible. First use after unlock is immediately eligible. Receipt replay cannot grant a second conversion.
- Optional orders/conversions must fit fully and fail with an explicit destination-storage reason when they do not. Collection/credit claim can transfer partially. Pending incoming order capacity is reserved and released on cancellation.
- Profits, refunds and earned rewards above wallet capacity remain owned but unspendable pending credits. Exact rational asset pools preserve fractions across origins; valid whole units become claimable as space permits. Claiming transfers existing value and is not another profit, reward or conversion bonus. Reports include original earned overflow in PnL.

### Questions and emergency assistance

- Twelve approved server-owned questions unlock in the optional village hub after each lesson's three scenarios. The current bank is [questions.json](../src/mocks/economy/questions.json); approved draft/provenance is preserved in the planning archive.
- Correct answer is displayed separately from **Explanation**. Wrong answers cost nothing; retries are unlimited. First correct completion pays 5 USD on accepted attempt 1 or 2.50 on accepted attempt 2 or any later attempt. Later answers/practice/relogin/text edits do not pay again. Stale question revisions/invalid commands do not count as a new accepted attempt.
- Assistance is a **claimable extra 100 Demo USD**, not a top-up to 100. Eligibility requires spendable cash strictly below $50 and checks for usable recovery routes; 20 becomes 120, exactly 50 is ineligible. Merely reserving funds must not manufacture poverty. The service checks claimable credits, collectible resources and actually available conversion recovery; no forced sale/close.
- Assistance amount/threshold are policy data, but **ordinary cadence/repeat limits are intentionally still undecided**. Unconfigured ordinary policy does not offer a grant. The explicit nonproduction `COT_ASSISTANCE_FIXTURE=once` permits at most one eligible test claim per player, durably recorded. This is not the production schedule or a global minimum trade-size rule.

## Frontend/backend separation and integration

```text
Player input / selected screen
  → src/api/client.ts (typed HTTP + stable command identity)
  → src/app/api/mock/*/route.ts
  → src/mocks/handler.ts (request/auth/error boundary)
  → src/mocks/store.ts (owner, due events, transaction, original receipt)
  → market / economy / resources + validated policy
  → durable exact snapshot + receipt
  → returned PlayerState / quote / preview / report
  → React renders the returned values and availability
```

| Owner/location | Responsibility and reason |
| --- | --- |
| `src/features/identity/` | Login input, PIN feedback, navigation and stale session response guards. These are device interactions; service verifies credentials and replaces authority. |
| `src/features/trading/` | Unsent order selections, preview requests, current price/chart/result rendering, dialog focus and uncertain-delivery recovery. No local affordability, matching, pass/fail or PnL engine. |
| `src/features/village/` | Building selection, converter pair, payment selection, quote review, acknowledgement, question choice, history rendering and responsive presentation. Selection is intent, not permission. |
| `src/api/{types,market-types,economy-types}.ts` | Executable proposed wire DTOs; decimals remain strings. These are the integration boundary for the later backend. |
| `src/api/client.ts`, `useLessonCommands`, `useOrderPreview` | Request orchestration, stable owner-scoped intent retry and stale-response suppression. A lost reply cannot establish whether execution occurred. |
| `src/mocks/handler.ts`, `store.ts` | Server-owned validation, current session, account/quote/receipt ownership, due-event reconciliation, common transaction and idempotency. |
| `src/mocks/market/` | Prices, exact execution/reservations/margin/liquidation, course rules/evidence, capacity, settlement and immutable reports. |
| `src/mocks/economy/` | Fixed conversion, construction/refund, pending entitlement pools, server grading/rewards, assistance offers and activity. |
| `src/mocks/resources/` | Exact elapsed production, storage pauses, collection and accepted effective-time changes. |
| `src/mocks/policy/` | Validated settings provider and structural precision/catalog metadata. Missing settings are not zero/free/unlimited. |
| `src/mocks/persistence/` | Internal exact codec, local single-writer file transaction/recovery. Not a public DTO or chosen database schema. |
| `src/shared/validation.ts` | Immediate input rules also enforced independently by the service. Keyboard hints are usability, not authorization. |
| `scripts/prepare-demo.mjs` | Explicit local disposable demo preparation/reset with backup. Not a player login dependency or production migration. |
| `scripts/check-guards.mjs` | Isolated guard-removal checks; no business engine for the client. |

Frontend-only decisions are necessary for immediate typing/caret feedback, unsent selections, layout/focus/navigation, local timestamp formatting and saving/retrying an uncertain request's identity. **The backend repeats every consequential check.** Browser storage holds device/session and pending transport recovery, not wallet/progression authority. A local countdown or disabled button cannot authorize a trade, reward or unlock. See the [full responsibility rationale](client-responsibilities.md).

### API responsibilities

Every path is currently under `/api/mock/`; protected requests use the current token. These are **proposed interfaces for integration**, not existing Go endpoints.

| API | UI purpose and returned information |
| --- | --- |
| `POST sign-in`, `GET state`, `POST sign-out` | Verify identity, restore current PlayerState, end session. Different-device sign-in revokes previous authority; the old device shows notice on its next connected request. |
| `POST command` | Start lesson, place/cancel order, close position, finish, collect, confirm conversion/upgrade/cancellation, claim pending/assistance or answer. Exact action unions live in the DTOs. Returns original receipt/replay flag and current state. |
| `POST order-preview` | Current instrument price, available/reserved funds/assets, maximum quantity, capacity and validation reason for the unsent order. Preview is not acceptance. |
| `GET report?attemptId=...` | Owned frozen scenario result/events/replay. |
| `POST quote` | `{kind:conversion}` source/destination; `{kind:upgrade}` building/payment asset; `{kind:cancellation}` construction ID. Returns owned binding terms for review. Named quote adapters also exist. |
| `GET catalog`, `wallet`, `economy`, `policy` | Read-only supported catalog, wallet/capacity and village/config projections. The main UI also receives consolidated state. |
| `GET history?limit=20&cursor=...` | Paged owned activity, rather than loading unbounded account history. |
| `dev-*` routes | Local reset/advance/resources/world/policy-migrate/export tools. Development-only loopback validation, hidden in production; not real backend public APIs. |

Safe errors distinguish insufficient funds, full destination storage, quote expiry/ownership, active demonstration, upgrade lock, acknowledgment, stale question, unavailable assistance, session replacement and store failure. The UI renders the returned reason; failed reads never become invented balances. Insufficient-order-funds errors include validated current balance/maximum details. See [the complete HTTP click map](backend-handoff.md#http-and-click-map).

Real integration should preserve the DTO/intent boundary, replace the mock adapter with authenticated backend requests, and implement the same server invariants with database transactions/constraints and workers. Replay and concurrent intent acceptance must be proved against the actual backend. The backend handoff includes logical record responsibilities, error semantics, rounding, timers, policy freezing and edge cases; it does not prescribe one database table per screen. No backend repository code was changed by this checkpoint.

## Runtime configuration and ownership

Current provider: [`src/mocks/policy/defaults.json`](../src/mocks/policy/defaults.json), optionally overridden by `COT_POLICY_FILE`. The server validates it and returns usable projections. React does not load deployment configuration as financial authority.

| Configuration | Current selected values |
| --- | --- |
| `startingCash`, `walletCaps` | 1000 once; USD 2000, ETC 350, SOL 20, BTC explicit `null` = unlimited gameplay capacity |
| `learning` | Duration 180s, guided fill 60s, stop trigger 30s, review 20s |
| `conversion` | Source value 50, bonus 1/4, quote 30s, cooldown 172800s |
| `construction` | Duration 43200s, Town Hall USD-equivalent 100, ETC cost BTC 0.001, BTC cost ETC 10, refund 1/2 |
| `constructionSlots` | Level 1: 20; level 2: 20 |
| `production` | Asset/level-indexed rates and capacities from the collector table |
| `quiz` | First correct 5, later first correct 2.5 |
| `assistance` | Threshold 50, grant 100, cadence `unconfigured` |
| `marketSeeds` | ETC 5.6845, SOL 100, BTC 58639.405: historical calibration seeds for simulated movement, **not current live prices** |

A changed policy needs a new version; immutable version fingerprints reject changing content under an existing ID, including after restart. Invalid reload retains last validated policy with a development warning; no valid initial configuration fails closed. Accepted scenarios, quotes and constructions freeze relevant terms; existing production changes require an explicit expected-version acknowledged effective-time migration. Lower caps preserve already owned units. Precision changes require a schema migration.

A future back office can publish these settings with role authorization, validation, preview, audit and rollback. DevOps can deliver/configure a versioned source; **backend validation and application** remain authoritative. Production control-plane ownership and tooling are not implemented. Configurability must never disable exact math, owner checks, once-only receipts or value preservation. Extra levels/building copies require complete new definitions, not arbitrary global defaults.

## Limitations, exclusions and follow-up

| Status | Item / required follow-up |
| --- | --- |
| **Requested guidance; not implemented** | **ETC collector upgrade funding:** when BTC funds are insufficient, show a contextual suggestion to convert existing **Demo USD or ETC into BTC**, then separately review the upgrade. The latest request's “ETH” refers to the superseded catalog; ETH is not currently supported. No automatic conversion or payment-asset substitution. |
| **Progression limitation** | Converter execution has no independent BTC-collector-ownership requirement, so an unlocked converter can target BTC regardless of how BTC was acquired. However, normal progression currently unlocks the converter **and awards the BTC collector after the same twelve spot passes**. ETC collector upgrades also require Town Hall 2. Thus “converter available before BTC collector unlock” is **not reachable through ordinary current progression**. Supporting that sequence would require a separately decided unlock change; this checkpoint does not introduce one. |
| **Guidance conditions still apply** | The proposed funding hint must use backend-returned availability: converter unlocked, outside real/practice demonstration, ≥$50 source value, no 48-hour cooldown, full destination room and reviewed valid quote. Show the blocking reason when unavailable. Fixed nominal $50 plus bonus can produce more or less BTC than the upgrade needs as prices move; do not promise an exact upgrade quantity or that one conversion always suffices. Converter unlock/cooldown is not bypassed by an upgrade need. |
| **Economy tuning pending** | Assistance cadence, repeat budget and future level costs/caps/production/slots need testing and backend configuration decisions. The finite test fixture is not a production answer. Current selected values remain editable through the validated provider. |
| **Simulation only** | No connected live price provider, real liquidity/funding/slippage model, fees, deposits/withdrawals, custody or Phoenix SDK execution. Guided fills/liquidation training and all-or-zero IOC/FOK are learning simulation; partial-fill production matching remains future work. |
| **Backend integration excluded** | No Go changes, selected production DB schema/migrations, distributed locks/workers, production session/security design or closure of unrelated backend defects. Node server mocks are authoritative only within this prototype. |
| **Local persistence only** | One writer per data directory. File durability/restart tests do not prove multi-instance/distributed DB correctness. Actual `.cot-demo` state contains private fake session/credential data and is excluded from Git. |
| **Design/platform pending** | CSS village art is replaceable prototype UI. Final art/motion, renderer, physical Android/iOS/WebView behavior, protected native credential storage, lifecycle/back/rotation/accessibility/performance and build/signing/distribution remain unverified or unbuilt. Responsive browser checks are not native-device evidence. |
| **No operator/back office** | Only player-facing application and separate local development tools are built. Staff roles, configuration editor, audit UI and production operations are excluded. |
| **Project boundary** | Backend-COT, DevOps and **Architecture explorer** are separate projects. Architecture explorer and its `DESIGNER_HANDOFF.md` are already saved separately; they are not nested or staged into this frontend commit. |

### What belongs in this commit

Application source, Node mock source, API DTOs/routes, runtime defaults, exact arithmetic/persistence, local helper scripts, Next/TypeScript/Playwright configuration, dependency manifest **and lockfile**, tests, phase/handoff documentation and the selected historical planning package. The test account credentials documented in the README are deliberately fake local fixtures, not production secrets.

### What is excluded from this commit

- `node_modules/`, generated `.next/`, `.next-build/`, `.next-test/`, generated `next-env.d.ts` and TypeScript build cache.
- `.cot-demo/` including snapshots, sessions, lock files, exports and local backups; external work/review/test logs and temporary test databases.
- `test-results/`, `playwright-report/`, local environment files and macOS `.DS_Store`. A deliberately authored `.env.example` may be tracked; no secret is to be placed in it.
- Files from other COT repositories, local process state and any push/deployment/native package.

The existing local browser can retain its current data; committing source does not reset accounts or stop the running server.

## Validation for this checkpoint

Executed on 27 November 2026 against the unchanged application implementation, with isolated test data:

| Check | Result |
| --- | --- |
| `npm test` | 134 passed, zero failed/skipped |
| `COT_NEXT_DIST_DIR=.next-build npm run build` | Passed |
| `npm run typecheck` | Passed |
| `npm run test:ui -- --reporter=line` | 63 passed |

Source/archive/link, ignore and staged-content audits accompany the local checkpoint. Generated outputs and detailed local test logs are excluded from Git. No reset of the running player environment was required.

Previous [test evidence](test-evidence.md) preserves the earlier domain/browser and eight guard-removal results with their own execution dates. Guard-removal was not rerun for this documentation/staging checkpoint because gameplay code is unchanged. Counts do not prove every edge case, production backend behavior or native compatibility. The selected planning [edge-case matrix](planning/phase-5-11/EDGE_CASES.md) remains pre-implementation planning evidence; its historical NOT RUN status is not a current execution receipt.
