# Runtime configuration, responsibilities and deferrals

Current scope: backend-owned mock policy provider plus development tooling; future back-office UI is excluded. User selected per-level runtime configuration and authorized settled local implementation while away. Config values are data, security/accounting invariants remain code.

## Selected policy catalog

| Domain | Data resolved by the service |
| --- | --- |
| Assets |USD12/ETC6/SOL6/BTC8 quantity precision,internal price6 with ETC/SOL6 and BTC4 accepted price decimals,step/bounds; explicit fixed/unlimited/unconfigured wallet-cap tags |
| Wallet |USD2,000;ETC350;SOL20;BTC gameplay-unlimited; pending credit/partial claim policy |
| Converter |50 USD nominal/minimum,25% bonus,0 fee,30s quote,172,800s cooldown,12-spot-scenario unlock |
| Construction |Town Hall-level1/2 max20;one active/building;payment assets/cost/duration/prerequisites/target effects;50% same-asset refund and acknowledgement |
| Buildings |Town Hall100 USD/12h→collector2 access;ETC2 upgrade0.001 BTC/12h;BTC2 upgrade10 ETC/12h;selected old/new rates/stores |
| Questions |Content revision/stable IDs;5 first-correct-first-attempt,2.50 any later first-correct;one payout;free unlimited wrong retries |
| Assistance |Threshold strictly below50 spendable USD after recovery checks;fixed100 extra;cadence/repeat policy required but ordinary values deferred;finite development preset |
| Learning |Current scenario/lesson prerequisites/required events/timing policy;Learning1=12 spot;Town Hall separate;no mandatory quiz |

Money/quantities are decimal strings, durations/counts safe integers, policy versions immutable. Representation precision is structural metadata: validate quantityDp+priceDp≤12 and reject incompatible precision changes until an explicit migration;it is not a casual live knob that reinterprets stored units. Example BTC capacity is kind=unlimited, not missing/null/zero. Future levels require configured policy; no arbitrary inherited free/zero/unlimited defaults.

## Proposed application semantics

Service validates a candidate policy completely, publishes one version/effective time atomically and records actor/source/diff. New quotes/actions resolve current version. Already accepted constructions/orders retain accepted cost,refund,duration and promised effects; an edit never restarts or reprices a paid operation. Updated construction limit20→5 with10 active keeps10 and blocks new starts until below5.

Existing production/storage migrations use explicit effective-time intervals and preserve funds; no retroactive payout, cap truncation or backfill. Cost/limit edits are ordinary runtime data changes; changes to already-owned rate/cap history need an explicit validated migration command with preview, not a JSON overwrite that rewrites history. Initial implementation supports the provider and safe effective-time model; staff editor/permissions UI is later.

Keep current valid policy if a candidate fails validation; report rejected activation in development diagnostics. With no valid policy, financial features are unavailable, never free or unlimited. Persist policy references needed by receipts/constructions across restart. Price seeds initialize new mock profiles only; they do not secretly rebase existing holdings. Market movement is controlled by shared simulation state, not a frontend price constant.

Public player endpoints cannot publish policy or override reward/limits. Development tools invoke the same validator/provider. Future back office requires staff authorization/audit/preview/rollback. It cannot disable owner checks, exact arithmetic, nonnegative ledger, stable-intent replay or atomic writes.

## Frontend justification matrix

| Frontend task | Why it is frontend | Service remains responsible for |
| --- | --- | --- |
| Navigation,expanded panel,draft selection,focus |Immediate interaction has no authoritative financial effect |Capabilities,eligibility and actual command acceptance |
| PIN numeric/max-length feedback and lexical quantity hints |Typing feedback avoids needless failed requests |Independently validate PIN,amount step/shape/permissions;UI restriction is not security |
| Render prices/amounts/capacity/reward/expiry |Player needs current state and clear explanations |Exact calculations,canonical reasons,current trusted time,maximums and policy version |
| Readonly converter source/destination and explicit confirmations |Records the player's intent/acknowledgement |Fixed50,bonus,30s validity,48h gate,actual money and refund effects |
| Pending/uncertain UI,stable intent storage and retry |Transport can lose responses;UI must recover delivery identity |Receipt ownership,canonical payload,once-only effects/current state |
| Countdown animation/chart/landscape layout/accessibility |Visual presentation and device constraints |Deadline eligibility,market data and normalized chart values;device clock never authorizes |
| Correct-answer line then Explanation block |Readable educational feedback is presentation |Grading,accepted attempts and5/2.50 payout |

No browser balance update,question grading,unlock,constructor limit,production/cooldown/recovery policy or fallback financial engine. Server-owned values are not copied into independently mutable UI state.

## Approved deferrals

1. Assistance cadence/repeat limits/future level overrides tuned during testing. Ordinary missing cadence is unconfigured. A separate developer preset allows at most one100 grant per test player; this is an explicit finite fixture, not production frequency.
2. Final mobile visuals/art/renderer refinements: design team later. Current functional landscape browser prototype uses replaceable art and usable portrait fallback.
3. Native Android/iOS build/signing/store distribution,real Go/database/worker/provider integration,cloud deployment,staff UI and additional building levels/copies are excluded now.

## Recipient handoffs

| Recipient | Deliverable and honest limit |
| --- | --- |
| Backend |Selected decisions,exact units/rounding,data relationships,DTO/errors,policy version/effective time,once-only ordering,local-persistence findings and still-unverified Go/database tests |
| Frontend |Control→API→service→state map,returned capabilities,layout/keyboard/theme/uncertainty states,why each client-only task is presentation/transport |
| Back office |Configurable keys/levels,validation/audit/rollback/migration requirements,accepted-operation grandfather rules;no staff UI delivered |
| Design |Landscape-first functional flow,approved answer/explanation layout,all error/empty/loading/storage/confirm states;production art/layout remains pending |
| DevOps/platform |Mock data/policy path and backups/reset/restart constraints,one-writer boundary,API reachability,Android/iOS feasibility and later lifecycle/signing checks;no deployment claim |

Each handoff includes decision provenance/status and verified versus planned evidence. README and BACKEND_HANDOFF are updated after implementation with actual file/function/test references. No unrelated repository or private project overlay is part of this work.
