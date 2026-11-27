# COT player prototype

A browser-first trading-learning village with fictional funds. The player application and its **server-side mock backend** live here; Go integration is a later step. Phases 1–9 cover the working browser flows. Phases 10–11 deliver Android/iOS feasibility and handoff, not native builds.

## Start and explore

Use Node 24, then:

```sh
npm install
npm run dev -- --port 3100
```

Open [the local prototype](http://127.0.0.1:3100). Fake test accounts are `learner / 0073`, `trader / 0042`, and `visitor / 0000`. Developer tools are separate from player navigation. The PIN accepts exactly four ASCII digits; account names accept lowercase letters only. A successful sign-in replaces the account's previous session. The other device receives the sign-out notice on its next connected request.

Start with the learning hub. Each lesson has three scenarios. The twelve spot scenarios unlock perpetual lessons and the converter. Completed scenarios replay as isolated practice; they do not change real balances or progress. The wallet continues between lessons. The service sells lesson purchases first and preserves previously owned assets when settling the lesson.

The village includes two collectors, Town Hall construction, conversion, wallet storage, pending credits, optional questions and assistance status. Converter input is only source/destination. It quotes a nominal $50 source value with a 25% game bonus and zero fees; **all conversion is then locked for 48 hours**. You must review its quote and volatility notice. Manual village actions are available between demonstrations.

## What is implemented

| Phase | Deliverable                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1–4   | Identity, continuing wallet, all 36 spot/perpetual/combined scenarios, order previews, evidence, timed observation, settlement and frozen replay |
| 5     | Fixed-value conversion, binding quotes, exact rounding/change, bonus, cooldown and errors                                                        |
| 6     | ETC/BTC production and separate collector storage, Town Hall/collector upgrades, paid cancellation and restart                                   |
| 7     | Wallet caps, protected pending credits and partial claims, recovery checks, configurable assistance                                              |
| 8     | Twelve optional questions, unlimited retries, one-time 5/2.50 USD reward, separate answer/explanation, landscape village UI                      |
| 9     | Durable local mock state, versioned policy, actual API/data/responsibility handoff and test evidence                                             |
| 10–11 | Browser/mobile feasibility and Android/iOS integration checklist; no APK, IPA or simulator claim                                                 |

Current starting allocation is 1,000 Demo USD, once per disposable profile. Wallet limits are USD 2,000, ETC 350 and SOL 20; BTC has no gameplay wallet cap. Numerical safety limits still apply. Collector stores and wallet limits are different. ETC produces 1/hour up to 50; BTC produces 0.0001/hour up to 0.005. Level 2 doubles both rates and stores.

Town Hall 1→2 requires the twelve spot scenarios, costs $100 equivalent in one payment asset and takes 12 real hours. It unlocks collector upgrades, independently of perpetual learning. ETC's upgrade costs 0.001 BTC; BTC's upgrade costs 10 ETC; each takes 12 hours. Cancellation requires acknowledgement and returns half the original paid asset units. Excess refunds/profits/rewards remain owned pending credits.

The assistance threshold is strictly below $50 of cash after accessible-recovery checks; the grant is an extra $100. **Ordinary assistance frequency remains deliberately unconfigured**, so it is unavailable until a valid policy is supplied. `COT_ASSISTANCE_FIXTURE=once` enables the finite development-only demonstration preset. This is not a production schedule.

## Debug one click at a time

```text
React component → api/client → Node route/handler → DemoStore transaction
               → MarketBook/EconomyBook + policy → durable receipt/state → React
```

| Location                 | Purpose                                                                        |
| ------------------------ | ------------------------------------------------------------------------------ |
| `src/features/identity/` | Sign-in, session response guards and navigation                                |
| `src/features/trading/`  | Order input, previews, delivery recovery, lesson/replay rendering              |
| `src/features/village/`  | Building selection, quote dialogs, storage, questions and assistance rendering |
| `src/api/`               | Typed wire contract and HTTP client                                            |
| `src/mocks/handler.ts`   | Request/method/body/auth boundary and safe errors                              |
| `src/mocks/store.ts`     | Player ownership, one wallet, transactions, common intent receipts             |
| `src/mocks/market/`      | Exact units, execution, reservations, margin, evidence, settlement             |
| `src/mocks/economy/`     | Quotes, conversion, construction, pending fractions, questions, assistance     |
| `src/mocks/resources/`   | Exact elapsed production and effective-time migrations                         |
| `src/mocks/policy/`      | Validated runtime settings and structural asset metadata                       |
| `src/mocks/persistence/` | Exact serialization, atomic file writes and failure/restart tests              |

For learning frontend code, trace **Select source/destination → Review conversion → Confirm** first. Then trace order preview and its returned maximum. Keep amounts as strings in React. Read [client responsibilities](docs/client-responsibilities.md) for the reason each browser concern belongs there. Learn input/state/rendering first, then asynchronous requests and stale-response handling, then the domain service and tests. Do not move wallet arithmetic into a component to make a screen work.

## Data and runtime configuration

The service persists in gitignored `.cot-demo/players-v5.json` (override directory with `COT_DEMO_DATA_DIR`). Restarting the service retains wallets, sessions, deadlines, receipts, quotes, construction, cooldowns and accepted question attempts. Browser storage holds only device/session and uncertain command recovery, not financial authority. Protect the mock data directory even though these are fake accounts.

Only one service writer may use a data directory. Atomic file rename/checksum/locking provides local mock recovery; it does not establish production database durability. A missing previously initialized file, corrupt snapshot or incompatible saved shape fails visibly. It never quietly grants another 1,000. Explicit developer reset archives the old snapshot and invalidates fake sessions. The approved XRP/ETH→ETC/BTC catalog cutover was a deliberate disposable-profile reset after backup, not a 1:1 financial migration.

Runtime settings are in `src/mocks/policy/defaults.json`; `COT_POLICY_FILE` can point to another validated file. Publish a **new version** for changed settings. The service retains its last validated policy if a reload fails. Costs, slots, rates, caps, timers and reward parameters live here, with level-indexed collector/slot settings. Accepted quotes/constructions/scenarios freeze their applicable price/cost/duration/effect. Changing owned production needs an explicit acknowledged effective-time migration, not retrospective JSON reinterpretation. Precision changes require a schema/data migration.

Developer lesson-clock advance affects only the demonstration. World-clock advance is separate and can exercise 12-hour builds/48-hour cooldowns. Resource-only advance tests collector capacity. These tools are unavailable in production and restricted to loopback requests in development.

## Checks and handoff

Read [the complete project checkpoint](docs/project-checkpoint.md) for every phase, current decisions, exclusions, pending limitations and upgrade-funding guidance. The [selected planning archive](docs/planning/phase-5-11/README.md) preserves the full Q&A/configuration/edge-case design record with its historical status.

```sh
npm run typecheck
npm test
npm run build
npm run test:ui
```

Use [backend handoff](docs/backend-handoff.md) for exact behavior, records and API mapping, [phase 5–11 guide](docs/phase-5-11.md) for review flows/configuration, [platform handoff](docs/platform-handoff.md) for the Android/iOS path, and [test evidence](docs/test-evidence.md) for executed checks and remaining limits. Older phase documents describe their historical slices; the current handoff supersedes their old catalog, in-memory persistence and resource settings.

The local Node routes need a running service. A native web shell cannot execute them as static bundled assets. No Go repository, database, real-price provider, production credentials, back-office UI, cloud deployment or app-store publication is included.
