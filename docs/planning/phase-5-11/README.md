# Selected phases 5–11 planning archive

Saved in Frontend-COT on 27 November 2026 from the existing COT `work/frontend-intake/phase5-11-planning/` package. These nine files are retained **byte-for-byte** to preserve selected decisions, rationale and planning provenance. This index is new.

**Read [the current checkpoint](../../project-checkpoint.md) and [implemented backend handoff](../../backend-handoff.md) first.** User decisions remain product authority. This archive records selected behavior and delegated engineering proposals before implementation; it is not a production API specification, execution receipt or approval of every proposed algorithm. The current executable DTOs are in `src/api/` at the repository root. Where a proposed module/route/status differs from the final implementation, consult the current handoffs/types and report requirement disagreements.

## Retained artifacts

| File | Historical purpose | Original SHA-256 |
| --- | --- | --- |
| [DECISIONS.md](DECISIONS.md) | Selected Q01–Q56 register, provenance and deferrals | `4658452b5babe56d036b011ca5f426176a40cdfce200dc04b63e52febaa172c8` |
| [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md) | Pre-implementation R01–R10 design/record/algorithm proposals | `0cc596876f26cab1d0774f4d912f327412782517ad9e6d289906e4c77f52067c` |
| [CONFIGURATION.md](CONFIGURATION.md) | Runtime configuration and frontend/backend rationale | `1a6aa082b09b999f66cf8dcad0b146aa25a334bdb99c1e0f3f89823c6efab0d6` |
| [CAPACITY_AND_UPGRADES.md](CAPACITY_AND_UPGRADES.md) | Selected unit capacities and cross-asset construction | `7670c9f71be7a19937822720e0e98a978de2bfe7982faa37ab3610ed656f4a59` |
| [ECONOMY_PROPOSAL.md](ECONOMY_PROPOSAL.md) | Calibration, affordability calculations and conversion constraints | `ef003cb9922a0369f6d98594777dab38598b2fc65532a834ee3659752f913a26` |
| [EDGE_CASES.md](EDGE_CASES.md) | Pre-implementation scenario/edge-case plan; NOT RUN then | `31201c008922cb9cb8921dc967c136cb2dd14065dbe2f0b658ba067ec4f8399e` |
| [QUESTION_BANK_DRAFT.md](QUESTION_BANK_DRAFT.md) | Approved twelve-question content with draft status retained | `4f47fff2aa7b1dd0977ee23b9873537b141127042dd16d83deccf0b324af4ee1` |
| [BATCH_ANSWERS.md](BATCH_ANSWERS.md) | Final selected Q&A reconciliation and implementation delegation | `6503c6aecb47136b786235c347a2a6d0bbcdfb9a3e9e10f18683de34f5bda670` |
| [REFERENCE_QUOTES.json](REFERENCE_QUOTES.json) | Dated reference quotes used for mock calibration, not live prices | `312e3a5df88c7fb522a53ab6aab17b4909d877d6cb68884eebdffa934862c97b` |

## Historical status and missing old references

- **NOT RUN** and early test counts in these files describe the planning baseline. Current execution is documented separately in [test evidence](../../test-evidence.md) and [this checkpoint](../../project-checkpoint.md#validation-for-this-checkpoint). Do not count proposed edge cases as passed tests.
- `BACKEND_HANDOFF.md`, `CONFIGURATION.md` and related uppercase names here refer to the archived plan. The implemented current contract is the separate lowercase [backend-handoff.md](../../backend-handoff.md). Proposed service/module names and endpoint shapes are not claims that the Go backend exists.
- References to the original planning `README.md`, `PLAN_STATUS.json`, `OPEN_QUESTIONS.md`, `history/pre-consolidation/`, work-folder review receipts or old asset-price retrieval logs are historical context. They are deliberately not reconstructed or copied here. This README is the archive index, not that old planning README. Selected Q&A is in `DECISIONS.md`/`BATCH_ANSWERS.md`; current limitations are in the checkpoint. No absent open-questions artifact should be read as an unresolved question silently answered.
- Dated reference prices are calibration evidence only. Current browser prices are simulated; no live provider is integrated. Old XRP/ETH/USDT and third-collector ideas were superseded by Demo USD plus ETC/SOL/BTC, exactly ETC/BTC collectors.
- The latest upgrade-funding guidance was requested **after** these artifacts. Its unimplemented hint and normal-progression unlock limitation are recorded in the checkpoint; the archive originals are not retroactively changed.
- Ordinary assistance cadence, final art/renderer/mobile execution, real markets, Go/database integration, staff UI and deployment remain deferred or excluded as described by current handoffs. “No pending product questions” in the selected planning record means no blocker for the agreed browser scope, not that these later deliverables are complete.

Discarded drafts, runtime/account snapshots, secret/session exports, review process logs and other COT repositories are excluded from this archive.
