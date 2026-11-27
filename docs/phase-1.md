> Historical phase slice. The current [backend handoff](backend-handoff.md) and [phase 5–11 guide](phase-5-11.md) supersede old asset names, collector settings, in-memory persistence and economy assumptions below.

> Historical foundation scope. Identity remains current; Phase2 replaces the clock-only lesson with market execution and assessment. See [Phase2](phase-2.md).

# Phase 1 scope and checks

COT player-facing mock identity/navigation only. The latest selected policy is **one signed-in session/device per account**. This supersedes historical three-device, inactive Continue and replacement-chooser plans. No backend code, remote branch or hosting is changed.

- P1/P9: lowercase usernames, four ASCII PIN digits, leading zeros, immediate invalid-entry feedback and bounded typing/paste/native insertion/drop.
- P2/P3: credential-first session replacement; current token only; former-device signed-out notice; ordinary same-device/logout/reset/unknown reasons; removed activate route; no silent reactivation.
- P4: independent accounts, token-derived ownership, strict request fields and no old-token game access or revocation of the new session.
- P5: shared lesson id/deadline and seed across logins; fixed 180-second expiry gives no pass.
- P6: late-response protection, reload/reconnect, logout retry, reset serialization and delayed-reset guards.
- P7/P11: responsive game/login/notice; keyboard labels/focus; no ordinary player device counter/badge/status. Developer metadata stays in separate development tools.
- P8/P10: build/types, development-only reset, safe known error mapping across module reload; no malformed/private exception leakage.

Executable cases are in `src/mocks/store.test.ts` and `tests/player.spec.ts`. Actual snapshots, test receipts and fresh reviews live in `COT/work/frontend-intake`. Plan approval alone is not execution evidence. Browser checks and screenshots are not physical Android tests.

No order entry, moving market, 80-second eligibility, settlement, progress award, generator accrual, conversion/reward or operator app exists yet. Phase 2 has not started. Production auth/device verification, storage, distributed concurrency and native lifecycle remain unverified.
