# COT prototype validation

Scope: the local browser application and its Node mock backend. The acceptance source is the selected COT decisions recorded in `docs/phase-5-11.md` and `docs/backend-handoff.md`. Real Go/database integration, native packaging, signing, app stores, real market feeds, deployment infrastructure and final game artwork are outside this validation.

## Reproducible checks

- `npm test` runs exact-money domain checks, service/HTTP checks, all 36 learning scenarios, policy changes and persistence/failure checks. Each HTTP test process uses a separate temporary data directory.
- `npm run test:ui` starts an isolated loopback server on port 3101 with `.next-test` output and a temporary mock database. It does not reset or replace the preview on port 3100. Browser assertions cover both themes, landscape and portrait fallback, keyboard input, offline recovery, rejected sessions and money-changing flows.
- `npm run typecheck` checks the integrated types. Production build evidence is recorded separately by the coordinating agent.
- `node scripts/check-guards.mjs <output-json>` copies `src` into temporary directories, removes one guard per copy and verifies that the corresponding contract test fails. It never edits the live source or sends network requests.

Final integrated execution: **134 service/domain/HTTP/persistence checks passed; 63 browser checks passed; 8 of 8 isolated guard mutations were detected.** `npm run typecheck` passed. These counts describe this execution only.

The final dated execution logs are kept in `work/frontend-intake/phase5-11-unit-final.txt`, `phase5-11-browser-final.txt` and `phase5-11-guard-removal.json` under the COT work folder. Counts and exact integrated snapshot are recorded in the final coverage manifest; a previous run is not evidence for subsequent edits.

## Independent oracles and regression fixtures

The E-series economy tests use selected examples directly: exactly 50 USD, 30 seconds, 48 hours, 12 hours, 20→120 emergency assistance, 5/2.50 first-correct rewards, a synthetic 3 USD/BTC conversion with a half-satoshi owed bonus, original-unit half refunds and two fractional origins forming one claimable atomic unit. Money assertions use exact integers.

`src/mocks/market/test-fixtures.ts` preserves historical COT 2/100/2000 scripted prices as explicit test inputs after renaming asset labels. Prerequisite fixtures deliberately restore fixed marks for those historical PnL oracles. Production progression does not reset prices. J01 independently exercises all 36 scenarios with the actual new catalog, current default policy and continuous mock marks, then verifies practice cannot change the real wallet or marks.

Browser amount assertions use either independent selected arithmetic or verify that the UI renders the service's current authoritative response. Domain tests, rather than screen-derived numbers, verify the financial arithmetic.

## Requirement coverage map

Each row maps both the valid and unsafe case families from the reviewed plan. Native/production concerns are explicitly documents-only or unverified.

| Family              | Main valid and unsafe evidence                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| F identity          | Store P2/P3/P4, HTTP ownership checks, S02, player browser session-replacement cases                                                                  |
| F catalog           | J01 all 36 scenarios; E24 old asset rejection; corrupt/unsupported persistence tests; explicit catalog backup evidence                                |
| F practice          | Historical T4/T6 goldens; E17/E21; J01 real wallet/mark preservation; V05                                                                             |
| CFG versions        | C01 frozen quote/transaction policy; C06 new profile seeds; C07 actual cold process reused-version rejection; policy validation tests                 |
| CFG slots           | C02 fixture accepts twentieth/rejects twenty-first and preserves existing jobs under lower limit; E11 rejects duplicate building                      |
| CFG effective       | C03 prospective production migration; C05 offline other-owner completion precedes migration; resource cap/no-backfill tests                           |
| MKT marks           | J01 coherent current marks, all 36 real scenarios and isolated practice; E05 binding conversion price                                                 |
| MKT prices          | E18/E19 valid precision and missing/zero/negative provider-component rejection; metadata/current-price browser cases                                  |
| CONV fixed          | E02 fixed value/bonus/no client amount/same-asset; E24 unsupported aliases                                                                            |
| CONV boundary       | E03 below50 rejection; E23 exactly50 succeeds                                                                                                         |
| CONV oracle         | E06 synthetic 3 USD/BTC arithmetic/fraction; E18/E24 precision and zero received rejection                                                            |
| CONV lock           | E01/E03/E17 unlock/cooldown/active gates; S01 original receipt recovery; V02                                                                          |
| QTE expiry          | E04 exact expiry; E23 just-before expiry; S01 replay after expiry                                                                                     |
| QTE replay          | S01 original receipt during practice, consumed quote and changed payload; S02 cross-action key conflict; persistence ambiguous-save recovery          |
| WAL caps            | E01 fixed caps/unlimited BTC; E20 full entitlement capacity; policy missing/BTC cap and technical-bound checks                                        |
| WAL room            | E04/E20 full bonus fit and revalidation; core preview/reservation tests                                                                               |
| WAL collection      | Resource tests; course G/D partial collection leaves remainder; real/practice active rejection; browser collection recovery                           |
| WAL pending         | E08 partial claims; E14 quiz overflow; E21 profit overflow; E25 refund overflow; V05                                                                  |
| WAL fractions       | E06/E07 fractional pool/FIFO; E10 odd BTC refund; guard-removal fraction-pool check                                                                   |
| WAL reserved        | Perpetual margin/reservation and combined rejection domain/browser checks; E17 prevents recovery manipulation during active demonstrations            |
| PROD rates          | E01/E11 exact two collectors and level2 settings; resource tests                                                                                      |
| PROD time           | C03/C05 old/new intervals; historical lesson-only developer-clock checks; resource full-cap pause/no-backfill                                         |
| UPG prices          | E09/E11 prerequisite/payment/opposite-asset checks; C01 policy freeze; V03                                                                            |
| UPG completion      | E09 12-hour endpoint; E11 duplicate building; C09 terminal records; V03 reload retains construction ID/timer                                          |
| CAN acknowledgement | E10 false acknowledgement and original-unit odd refund; V03 visible loss and disabled confirm until acknowledgement                                   |
| CAN race            | E10 completed construction cannot cancel; C09 terminal completed/canceled outcomes; atomic persistence rollback tests                                 |
| CAN restart         | E10 fresh full cost/timer/ID; C09 preserves original terminal records while replacement finishes                                                      |
| QUIZ rewards        | E13/E14 first correct5, later correct2.5, wrong/repeated0, capacity overflow; V04                                                                     |
| QUIZ attempts       | E22 stale content; persisted grading/paid identity restart test; common receipts and cross-action conflicts                                           |
| QUIZ feedback       | E12 optional lesson-gated content; V04 correct answer and explanation are separate DOM blocks                                                         |
| HELP grant          | E15 strict below50 and extra100; E22 changed funds revalidation                                                                                       |
| HELP recovery       | E16 pending/collector/converter recovery; C08 configurable bonus and exact destination-fit branches                                                   |
| HELP cadence        | E15 finite development fixture/unconfigured ordinary policy; C04 ordinary configured one-hour/two-claim policy                                        |
| PER restart         | Durable session/wallet/deadline/receipt/quiz restart checks; C07 actual cold process policy registry                                                  |
| PER crash           | Post-mutation save rollback, ambiguous rename acknowledgement, actual SIGKILL commit/lock recovery, live writer exclusion, killed stale-lock recovery |
| PER delivery        | Existing browser unknown delivery, stable retries/reload, storage failure, known-offline and old-owner response isolation                             |
| UX landscape        | V01 screenshots; V06 earned collector text stays within clickable buttons at320/390 and clicking credits both assets; player responsive all tabs and non-overlapping targets at320/390/736; light/dark contrast/result/replay checks                       |
| UX authority        | Browser dependency-graph boundary test; E02/E17/E22; strict HTTP forged money/owner/quote fields; readonly converter UI                               |
| HAND trace          | Documentation cross-reference review and actual source/test locations; no production-integration claim                                                |
| HAND native         | `docs/platform-handoff.md` feasibility/handoff review only; no Android/iOS build, signing, emulator or store validation performed                     |

## Guard-removal checks

The isolated mutation suite verifies that contract tests fail without quote expiry, destination capacity, the active-demonstration gate, fractional-origin aggregation, the strict50 assistance boundary, practice wallet isolation, receipt recovery and all-owner reconciliation before global policy migration. The JSON receipt includes the copied source SHA-256 and actual failing output for each mutation. It is evidence that these checks can detect those specific regressions; it is not a claim that the application has no remaining bugs.

## Observed failures and corrections

The first browser diagnostic exposed outdated fixed-price and entry-button fixtures after the approved catalog/UI changes. Those fixtures were corrected against the selected policy and coherent-mark behavior. It also found real defects: browser development requests were rejected when Next canonicalized the URL's localhost alias, and Town Hall touch targets overlapped collector targets at320px. The service Host/Origin check and portrait grid layout were corrected and retested. Visual inspection also caught earned collector buttons being placed into a narrow icon column; V06 now checks actual text and button bounds at320/390 and verifies collection credits. The corrected full browser run passed63/63. A subsequent fresh V02 run passed1/1 for the final BTC “Unlimited gameplay storage” quote disclosure, along with total entitlement, source funds and simulated prices. Exact UTC execution times, command, exit status and log SHA-256 are in `phase5-11-browser-receipt.json` and `phase5-11-quote-ui-receipt.json` in the COT work folder. Successful-run screenshots are preserved in `work/frontend-intake/phase5-11-browser-evidence/` with hashes in `screenshots.json`.
