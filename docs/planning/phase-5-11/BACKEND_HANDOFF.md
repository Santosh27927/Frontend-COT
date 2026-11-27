# COT backend handoff — consolidated candidate-v1

**Proposed contract for authorized local implementation; not implemented Go/API.** Selected product behavior comes from DECISIONS.md/current chat; engineering details below are author-owned proposals within the latest delegated local implementation scope, subject to independent review and correction. All business authority is in the mock service now and the real backend later. JSON money/quantity values are strings. Route names are proposed mock extensions, not claims about published Go routes.

## R01 Scope, identity and compatibility

Browser/landscape prototype; Android/iOS feasibility only. Player-only app and development tools, no staff UI/live execution. Preserve current username/PIN/session/ownership semantics,36-scenario progression,180s deadline, accepted-order observation/evidence/late-pass rules, one-direction-per-asset perpetual model, real/practice isolation and frozen reports. Existing Phase4 docs describe the old catalog/collection model; new selections explicitly change asset catalog, capacity, collection timing and persistence.

Catalog becomes ETC/SOL/BTC plus Demo USD. User approves resetting disposable mock accounts at implementation of the new catalog, through an explicit developer action with an archived prior snapshot. Never auto-delete data on failed load or rename1 XRP→1 ETC/1 ETH→1 BTC. Reset affects COT demo state only; no Go source/profile reset is performed by this plan.

## R02 Policy, levels and market authority

Learning Level1 =12 spot scenarios (three each market/GTC/IOC-FOK/stop-limit). Complete before Level2 and converter unlock. Town Hall1→2 also requires those12 passes, costs100 USD equivalent and unlocks collector level2; perpetual learning does not wait for a paid build. Free collector awards once: ETC after market lesson; BTC after stop-limit. No SOL collector or duplicate practice award.

All policy is level/building/lesson/account configuration resolved server-side. Construction limit20 at Town Hall1/2, one active attempt/building. Runtime versions/effective-time behavior in CONFIGURATION.md. Client receives capability/reason/version, never authoritative flags from its own constants.

Engineering proposal: one per-player shared mock market state drives real lesson execution, chart/portfolio valuation, converter and payment quotes. Initialize fresh profiles from the pinned mock calibration ETC5.684500/SOL100.000000/BTC58639.405000 USD, clearly labeled mock, not live. Anchor scenario paths to existing marks with deterministic relative transitions; starting/switching lessons never resets an asset to an unrelated price. Practice market state is isolated and cannot change the persistent wallet's marks. Binding quotes preserve their price snapshot until expiry; normal time-separated price changes are not a screen-switch price jump. No real provider/SDK is selected.

## R03 Conversion

Only after Level1, outside demonstrations, with first use immediately eligible and no pre-use48h wait. Player chooses source/destination only. Quote input contains no amount/price/reward. Same-asset/unsupported pair rejects. Require at least50 USD of AVAILABLE source value, excluding reserved resources, using exact comparison before formatting. Nominal target50; nearest valid below-target quantity allowed and actual values/rounding disclosed. Zero fees; zero received units rejects.

Binding quote30 seconds from service creation: uncommitted request at/after expiry requires re-quote/reconfirmation. Preview has no financial reservation. Successful commit atomically debits source, credits base plus25% separate game reward, records change/pending fractions, consumes owned quote, starts172,800-second account lock and writes receipt. All new conversion blocked during lock, including unbonused requests; exactly cooldown end is eligible. Failure/preview/cancel does not start it. Full destination result including bonus must fit permitted storage; no partial conversion, silent resizing or dropped bonus.

Before confirmation show source, readonly nominal/actual value and units, current mock prices/as-of, base/bonus/total destination, rounding/change, current availability, destination headroom, expiry, volatility and48h lock notice. If destination ETC is full: destination-storage error, not source-insufficient error. Source USD1,000 does not override destination capacity. ETC→ETC rejects as same-asset independently.

## R04 Exact units and proposed rounding contract

Spendable units: USD12 decimals, ETC/SOL6, BTC8. Engineering policy: internal price scale6, accepted ETC/SOL price precision6 and BTC price precision4 (tick0.0001). This is explicit backend-owned metadata, not silent truncation. Quantity+accepted-price precision never exceeds12, so trade cash products are exact. Use scaled integers/exact rational intermediates; reject incompatible finer BTC order/quote prices BEFORE effects. No Number/parseFloat financial arithmetic, including thresholds, eligibility or formatting reparsing. Validate final representable bounds; gameplay-unlimited BTC is not permission for malformed/overflow numbers. Internal quantities may use8 digits uniformly while per-asset input/output quanta remain6/8. Derived weighted entry-price display is not reused as an authoritative payment price. Simulation paths quantize their GENERATED marks to advertised ticks; user prices are validated/rejected, never silently rounded.

Proposed no-loss unit algorithm for whole-plan approval:

1. Compare exact available source value against50 before rounding. Let D be floor(50/sourcePrice) to source quantum; USD source is exactly50.
2. Let V be D's exact quoted value. Floor the base destination to its quantum; let B be the value of those base units. B≤V≤50 is actual converted principal.
3. Return V−B as source-asset change, valued at the same quote. Whole source quanta return immediately; fractional source quanta remain owed pending credit. Thus unconverted value is not a hidden fee.
4. Bonus entitlement is exactly25% of BASE destination units/value B. Credit whole destination quanta and retain sub-quantum entitlement as pending credit. Source change gets no additional bonus.
5. Quote every immediate/change/pending effect; check full destination entitlement, including fractional bonus, against fixed capacity. BTC has no game capacity check. A positive debit with zero base destination rejects.

Pending fractions are exact owed atom fractions (integer numerator/positive denominator), not spendable order units. Aggregate/claim only representable whole quanta; preserve remainder. This also preserves EXACT50% refund on odd paid atom counts without silently rounding a promised refund down. Public state distinguishes spendable quantities from owed fractions and formats the latter clearly. Fractional precision must not loosen order input quantum.

Synthetic arithmetic oracle, not a live price: USD100, target50, BTC price3 and8 quantity decimals. Base16.66666666 BTC is49.99999998 USD. Source change0.00000002 USD; spendable USD becomes50.00000002. Exact bonus4.166666665 BTC = spendable4.16666666 plus owed0.000000005 BTC. All value conserved and bonus computed from actual converted principal. Never derive expected values by calling implementation math.

Upgrade USD-equivalent payment quote uses the smallest permitted payment-asset quantity covering100 USD; disclose actual units/value and quantum adjustment before confirmation. Fixed collector-unit prices need no FX denomination choice. Exact accepted units are the cancellation basis.

## R05 Wallet capacity and pending credits

Initial game limits: USD2,000; ETC350; SOL20; BTC explicitly unlimited. Limits fixed in units across volatility. Representation must distinguish {kind:fixed,units:string}, {kind:unlimited}, and unconfigured; missing/null values are not unlimited. Reserved inventory and committed cash/margin still count as owned wallet units. Perpetual notional is not owned spot inventory.

Service max/order preview includes available funds and destination headroom. Accepted pending buys reserve inbound destination headroom; quote reads do not. Fill consumes corresponding claim, cancel/expiry releases remainder. New orders/quotes cannot overbook it, including competing conversion/collection. Do not accept a guided order only to reject its promised fill later due to storage.

Optional buy/conversion rejects before effects if complete destination amount does not fit. Collection transfers min(stored,room) and leaves remainder in collector. Zero room means no transfer. Profitable close, lesson settlement, liquidation or refund cannot be blocked or lose funds: credit available room and preserve excess in owned unspendable pending credit. Same preservation applies to earned quiz reward and exact rounding change; it is not another free spendable wallet.

Claim button requests an owned ASSET credit pool; service aggregates exact owed fractions across origins, transfers only available room in whole valid quanta, leaves remainder pending and returns actual transfer. Allocate the transfer FIFO by persisted origin sequence, retaining per-origin rational allocations. Two distinct half-atom credits must combine into one claimable atom; neither origin becomes new profit or gift. Claim is not new profit/gift/reward/conversion and earns no bonus. BTC does not need capacity overflow, though fractional BTC entitlement may wait for representable units. Pending profit counts in its original trading result when earned; later claim does not add PnL again. Pending gift remains a gift. Claims recheck capacity and ownership atomically; old retries never claim twice.

## R06 Production and upgrades

| Building | Level1 | Level2 | Upgrade payment/duration |
| --- | --- | --- | --- |
| ETC collector |1 ETC/h,store50 |2 ETC/h,store100 |0.001 BTC,12h |
| BTC collector |0.0001 BTC/h,store0.005 |0.0002 BTC/h,store0.01 |10 ETC,12h |
| Town Hall |Level1 |Level2;collector2 unlock |100 USD equivalent in ONE USD/ETC/SOL/BTC asset,12h |

All collector stores hold50 hours of their level's production. Wallet limits are separate and unchanged by these upgrades. Real elapsed production only to capacity; full-time excess discarded, no backfill. Old rate/cap continues during construction; apply accepted new effect at actual completion, including offline intervals. Free awards/store accrual/transfers remain once-only. Lesson fast-forward never accelerates production or construction.

Upgrade quote validates owned current level, prerequisite passes/Town Hall, allowed ONE payment asset, available resources and concurrent slots. No mixed legs, automatic conversion/selling or paying collector with mined asset. If USD40 plus60-value ETC cannot singly pay100, show planning shortfall and explicit converter path subject to50/48h; do not bypass it.

Accepted start atomically debits payment, creates distinct construction with accepted policy/effects and completesAt=acceptedAt+43,200,000ms, occupies a slot, writes receipt. Current level remains old until completion.20/21 boundary uses development fixture catalog; do not add player building copies to reach20. Automatic completion and unlocked learning continue while other construction runs.

Cancel preview shows original units,50% original-unit entitlement, loss, any fraction/pending credit, expiry and acknowledgement. Command needs owned current preview and explicit acknowledgement. At/after completesAt, reconcile completion and reject new cancellation. Before it, one atomic canceled/refund-or-pending/slot-release/receipt transition stops future effects. Cancel and complete cannot both win. No conversion reward/cooldown change.

Restart after cancel uses new quote/full current cost/full timer/new construction ID, rechecks prerequisites and funds. No resumed time, automatic refund discount or permanent lifetime paid marker. One ACTIVE attempt per building and one successful level transition; canceled attempt history remains immutable. Old start/cancel replay or due completion event cannot charge/cancel/complete replacement. Future policy applies to the new quote, not retroactively to old payment/refund.

## R07 Questions and grading

12 approved items in QUESTION_BANK_DRAFT.md; one after each lesson's three scenarios, optional/hub access, no new pass/Fast-forward gate. Service serves immutable question revision/choice IDs, tracks accepted grading attempts and grades. Client cannot submit correct=true or reward amount. Network replay/timeout/invalid or unauthorized payload is not another graded attempt. A valid wrong answer is one attempt, gives explanation and permits unlimited free retries.

One reward on first correct completion:5 USD when correct on attempt1;2.50 when first correct on attempt2 or ANY later attempt. Wrong answers pay0. Once rewarded, later answers/practice/text revisions/device changes pay0; persist counters across logout/server restart. Reward amount and eligible attempt policy are quoted/versioned, not recalculated by frontend. Grading, reward-or-pending and paid identity commit atomically; failed credit cannot mark an unpaid entitlement consumed.

Feedback renders **Correct answer: A** as its own item, then a separate **Explanation** below with why. Preserve approved wording; source bank includes answer key for reviewer/service only, not authoritative public question payload. Maximum60 across initial bank if all first-attempt correct. First wrong then correct means2.50 total, not5+2.50.

## R08 Assistance

Manual claimable FIXED extra100 USD when spendable Demo USD is STRICTLY below50, retaining accessible-recovery checks.20→120, not a top-up to100. Exactly50 ineligible. This threshold is not a universal minimum trade amount; converter minimum50 is separate. Offer/claim are outside demonstrations.

Service checks actual current recovery routes before help: claimable credits, collection and usable converter path, cancelable reservations and realizable released margin. No forced sale/close/claim; explain available actions. Merely reserving100 cash so only20 is free does not manufacture depletion; assess real recovery result, not nominal collateral without PnL. USD20 with valuable BTC locked from conversion can still qualify when recovery is genuinely unavailable, under configured repeat policy. Failed recovery read/price is unknown, not zero funds.

Revalidate at claim; if funds recovered to50, offer consumed/expired or policy changed, reject/re-offer without credit. One offered grant/receipt; no client amount/threshold. Grant/refund/quiz gift attribution is external to trading PnL.

APPROVED DEFERRAL: cadence/repeat limits/level overrides tuned during testing. Ordinary policy without mandatory cadence/repeat configuration is unavailable, never unlimited. Developer test preset explicitly permits at most one grant per test player, using selected50/100 values, to demonstrate/test UI. It is test data, not production schedule. Claim history persists and cannot reset on relogin. Future back office controls the same required policy fields.

## R09 Action and read contracts — proposed mock API

Reuse current typed client/command route and current-session checks. Paths are draft additions; no Go endpoint claim.

| Control | Request | Service result/effects |
| --- | --- | --- |
| Read player/village/hub |GET state/catalog |Owned balances/free/reserved/pending, marks/policy revision, capabilities/reasons, prerequisites/levels/constructions; no browser eligibility math |
| Change converter pair |POST /api/mock/conversion-quote {from,to} |Owned immutable30s quote or source/destination/unlock/cooldown error; no reservation/debit |
| Confirm conversion |command {action:convert,intentId,quoteId} |Atomic R03/R04 effects or safe reject; original receipt/current state |
| Collect |existing collection command,owned collector/intention |Partial to room, residual stays stored; active demonstration rejects |
| Select upgrade asset |POST /api/mock/upgrade-quote {upgradeId,paymentAsset} |ONE allowed-asset payment/effects/time/refund/prerequisite preview |
| Start build |command {action:upgrade,intentId,quoteId} |Atomic payment/construction/slot/receipt |
| Open cancellation |POST /api/mock/cancellation-quote {constructionId} |Owned immutable refund/loss/fraction/eligibility preview; no financial effect |
| Acknowledge cancel |command {action:cancelUpgrade,intentId,cancellationQuoteId,acknowledged:true} |Atomic cancellation/refund/slot release; false/missing acknowledgement rejects |
| Claim credit |command {action:claimCredit,intentId,asset} |Transfer current representable room, leave remainder; no second PnL/gift |
| Open quick check |GET owned question/revision |Text/choices/attempt/reward offer; no public answer-key authority |
| Answer |command {action:answerQuestion,intentId,questionId,revision,choiceId} |Grade/attempt/explanation and one first-correct reward atomically |
| View help |Read assistance offer |Current eligibility/recovery reason/configured offer or unavailable; no grant |
| Claim help |command {action:claimAssistance,intentId,offerId} |Current under50/recovery/repeat checks; fixed100 once for this offer |
| Review events |GET owned history,cursor/filter |Immutable original operations and transfer history; pagination is not deletion |

All NEW manual village actions above, quiz/help claims/cancellation are blocked while a real/practice demonstration is active, even after navigating away. Automatic accepted fills/settlement/accrual/build completion continue. A previously accepted command's receipt replay is recovery, not a new prohibited action. Same-account takeover does not reset any policy/cooldown/attempt.

Proposed errors: existing auth/ownership/idempotency errors plus FEATURE_LOCKED,FEATURE_NOT_CONFIGURED,QUOTE_EXPIRED,QUOTE_USED,POLICY_CHANGED,PRICE_UNAVAILABLE,INSUFFICIENT_AVAILABLE_FUNDS,DESTINATION_STORAGE_FULL,CONVERSION_COOLDOWN,PAYMENT_ASSET_NOT_ALLOWED,CONSTRUCTION_LIMIT,UPGRADE_ALREADY_COMPLETED,ACKNOWLEDGEMENT_REQUIRED,QUESTION_STALE,ASSISTANCE_NOT_ELIGIBLE,ACTIVE_DEMONSTRATION. Safe responses show current required/available amounts and reasons; no private IDs/PIN/token/raw bodies. No missing value means0/free/unlimited.

## R10 Transactions, persistence and retries

Engineering proposal: one local mock service writer, serialized owner transactions, versioned durable snapshot/journal with exact string/rational serialization, atomic temp-write/fsync/rename and recovery checks. Persist wallet/ledger/receipts/quotes/constructions/attempts/credits/auth-current-session/policy references before success response. No browser-local financial authority. Proposed gitignored COT data directory with explicit developer reset; malformed/version-incompatible data fails visibly instead of resetting to1,000. No real Go/database crash guarantees inferred from local tests.

Operation ordering:

1. Authenticate current owner; validate shape/allowed fields and stable intent payload.
2. Look up prior receipt by player+intent before new-action quote/eligibility/funds checks. Changed payload conflicts.
3. Reconcile independently due accepted events at trusted service time. Return prior receipt PLUS reconciled state without re-executing. If state load/reconciliation fails after old success, preserve that success/intent and report state unavailable, never resubmit a fresh action.
4. NEW intent only: validate owned current quote/offer/revision/time, active-demo guard, funds/headroom/slots/eligibility. Prepare all financial/policy/receipt effects, including overflow and odd fractions.
5. Atomically persist effects and receipt, then publish current state. Failure leaves no partial debit/claim marker; independently due events remain their own coherent transactions.

A single-use quote/offer prevents a new key from replaying money. Original success replays after expiry/policy/funds/deadline changes. Stable pending intent is saved before send; no fresh known-offline financial action is queued. Owner/revision guards ignore late replies and clear prior account data. Persisted receipt/state plus owner-scoped recovery/history reconciles browser/service restarts. Multiple service writers are unsupported and must fail cleanly rather than race snapshot writes.

Chronological lesson engine is reused. Completion/cancellation/refund/production transitions have deterministic event IDs and accepted config; one due event cannot run twice across request/restart. Same-timestamp completion wins over a NEW cancellation at completesAt. Claim/convert/collect/start versus lesson entry uses transaction ordering; UI alone cannot enforce restrictions.

## R11 Logical data relationships and backend migration

| Record | Identity/relationships | Invariant |
| --- | --- | --- |
| Player/session/progress |Player,current token,lesson/scenario passes |Sole current owner;12 spot passes unlock learning2/converter, no per-lesson refill |
| Asset/policy/market snapshot |Version,effective time,precision/cap tag,price seed/current marks |Exact units, one authority, no price-induced cap changes or unsupported currency |
| Wallet/ledger/headroom claim |Player+asset,operation/order refs |One wallet, conserved funds, reserved incoming capacity, no overspend |
| Owed credit/claim |Original operation/asset,exact rational amount,asset pool,FIFO claim allocations |Owned unspendable remainder;cross-origin aggregation preserves origin attribution,no double PnL/gift or lost fractions |
| Quote/conversion |Owner,immutable pair/prices/policy/expiry,intent |Single-use atomic debit/base/bonus/change/cooldown |
| Construction/cancellation |Building,distinct attempt,accepted policy/payment,target/terminal time |One active attempt,one successful level transition,50% owed refund, restart isolation |
| Production interval |Collector level,rate/cap,effective time,accumulator/remainder |Old/new intervals,cap/no-backfill,real elapsed |
| Question/revision/attempt/reward |Stable question,served revision,accepted graded attempts,paid operation |One payout,5 or2.50 by persisted first-correct attempt,server grading |
| Assistance policy/offer/claim |Configured cadence/limits,owner,eligibility snapshot,grant receipt |Strict under50/current recovery,100 extra,repeat protection |
| Receipt/history |Player+intent unique,canonical payload,original result,effect refs |Replay original operation,monotonic owned state,retain history separately from pagination |

These are logical records, not one SQL table per screen field. Real backend must choose PK/FK/unique indexes/locks/transactions/workers and validate actual database failure/recovery. Reconcile older Go session funding/finish/goal assumptions with the continuing-wallet/evidence contract and existing recorded audit defects. No frontend plan/mock pass closes those defects.

Every final recipient gets selected/proposed/deferred decision IDs, policy keys/levels, exact DTO/error examples, records/effects, retry/clock/ownership rules, independent fixture provenance and actual versus planned validation. Design/native/DevOps/back-office production work remains explicitly scoped/deferred in CONFIGURATION.md.
