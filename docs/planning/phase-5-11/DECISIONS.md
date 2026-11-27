# COT selected decisions — consolidated register

User Q&A is resolved for this prototype. **Latest user instruction authorizes settled local implementation while they are away**, superseding the earlier final-approval wait. Business choices below are user-selected; engineering mechanics in BACKEND_HANDOFF/CONFIGURATION are delegated implementation proposals subject to review. Go/native/deployment/staff UI remain excluded.

| IDs | Selected behavior | Contract |
| --- | --- | --- |
| Q01,Q28–30 |Browser prototype,Android/iOS feasibility/handoff only,no native build |R01/README |
| Q02,Q33,Q40 |Town Hall1→2 costs100 USD equivalent;one USD/allowed asset |R06 |
| Q03,Q31,Q32,Q39,Q45 |ETC/SOL/BTC catalog;only ETC/BTC collectors. ETC after market,BTC after stop-limit. Cross-payment:BTC upgrade costs ETC,ETC upgrade costs BTC |R02/R06 |
| Q04,Q08,Q11 |Converter source/destination only;nominal50 USD value,25% separate bonus,all different supported pairs;no same-asset conversion |R03/R04 |
| Q05,Q09,Q10,Q35 |Automatic bonus,first use after unlock immediately eligible;successful use locks ALL conversion48h;failure/preview no consumption |R03 |
| Q06,Q07,Q43 |30s binding quote,reconfirm expiry,zero fees,zero received-unit rejection. Available source value≥50;nearest valid below-target quantity allowed,actual values/change disclosed |R03/R04 |
| Q12,Q53 |Manual village actions/quiz/help claims outside demonstrations;automatic accepted events continue |R09 |
| Q13,Q14,Q18 |ONE payment asset;no mixed/autoconvert. Town Hall USD/asset policy may change later. Payments/refunds/credit claims do not earn conversion bonus or change cooldown |R06 |
| Q15,Q49,Q50 |12h paid construction;cancel after exact50%original-unit refund/loss acknowledgement. At completion cancel unavailable. Restart full current price/new timer/new identity |R06 |
| Q16A |Town Hall1→2,one collector each with1→2;additional levels/copies later |R01/R06 |
| Q16B,Q37 |Learning1=all12 spot scenarios;complete before Level2/converter. Town Hall2 requires those12 and unlocks collector2,not paid perpetual-learning gate |R02 |
| Q16C |ETC1→2 costs0.001 BTC;BTC1→2 costs10 ETC;12h each |R06 |
| Q17,Q46,Q46A |Cash2,000;ETC350;SOL20;no gameplay BTC wallet cap. Combined wealth may exceed2,000. Fixed unit caps independent of volatility and collector store |R05 |
| Q47,Q54,Q55 |Excess profit/refund protected pending;manual claim only room,remainder stays. Partial collection;optional purchases/conversions must fully fit including bonus or reject with destination-storage reason |R05 |
| Q48,Q52 |ETC1/hour store50→2/hour store100;BTC0.0001/hour store0.005→0.0002/hour store0.01. Old production/cap during upgrade,new at completion |R06 |
| Q51 |Max20 concurrent constructions at Town Hall1/2,one active per building;runtime-configurable by level |R02/R06 |
| Q19,Q20 |Optional after three scenarios/hub;12-question content approved. Correct answer on its own line,Explanation below |R07/question bank |
| Q21,Q22 |Unlimited free wrong retries/explanations. First correct:5 USD on attempt1,2.50 on ANY later attempt. One payout per stable question |R07 |
| Q23,Q24,Q36 |Claimable EXTRA100 USD when spendable USD<50 after recovery checks.20→120,exactly50 ineligible. Merely reserving funds does not create depletion;locked assets may qualify if recovery unavailable |R08 |
| Q25 |Assistance cadence/repeat limits/future level tuning deferred to testing;configurable. Finite explicit development policies exercise UI;ordinary unconfigured policy not unlimited |R08/CONFIGURATION |
| Q26,Q27 |Functional web troubleshooting first,landscape-first responsive;final mobile art/layout reviewed with design team later |README |
| Q38 |Approved future reset of disposable COT profiles for new catalog,with backup;no1:1 asset rename/no reset during planning |R01 |
| Q44 |Already-unlocked play during construction;new effects only at completion |R06 |
| Q56 |Service-side local mock persistence across dev-server restarts;explicit reset |R10 |

## Delegated engineering decisions

- Exact scaled/rational math and preserved fractional entitlements;no silent writeoff or frontend arithmetic. Precise algorithm in R04.
- One shared anchored mock market,no screen-switch rebase;proposed dated mock seeds are not live values.
- Owned immutable quote/offer/config versions,atomic ledger/state/receipt,original intent recovery with due-event reconciliation.
- Durable local single-writer store and explicit catalog migration/reset;not real Go/database integration.
- Thin client/HTTP layers,focused service modules,config provider ready for later back-office API.
- Safe effective-time runtime changes preserve already-accepted promises and existing owned funds;details in CONFIGURATION.

These are implementation choices under the latest user delegation, not statements that each algorithm was individually user-approved. Surface a real contradiction in side questions and continue independent work.

## Approved deferrals / no questions silently answered

Assistance cadence/repeat limits are intentionally unconfigured for ordinary policy;finite developer preset only. Final mobile design,real market provider/live-price transition,Go/database/workers,extra buildings/levels,back-office UI and native packaging/signing/deployment remain future work. They do not block the agreed browser/mock scope. Each recipient's handoff must preserve selected/deferred/unverified status and runtime policy keys.

Earlier proposals are archived in history/pre-consolidation. Current chat is ultimate authority if a record disagrees. Source implementation and actual tests must be reported separately from plan review.
