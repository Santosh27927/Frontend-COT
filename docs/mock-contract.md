> Historical phase slice. The current [backend handoff](backend-handoff.md) and [phase 5–11 guide](phase-5-11.md) supersede old asset names, collector settings, in-memory persistence and economy assumptions below.

# Identity mock API contract (with Phase 2 integration)

These local Next routes simulate the later player API. They do not call or modify Go or the existing published OpenAPI. See [current Phase3 backend/action/financial contract](backend-handoff.md) for trading, preview, collection and safe funds details. The latest user clarification selects one logged-in device and supersedes the earlier three-device/Continue proposal. All data is fake and temporary. Financial fields are strings; responses use `Cache-Control: no-store`.

| Action              | Request                                                              | Ownership/effect                                                                                                                                                       | Result                                                                      |
| ------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Sign in             | `POST /api/mock/sign-in` `{username,pin,deviceId}`                   | Validate credentials first, then revoke the prior token and create the sole current token for that player. Keep lesson/deadline/funds. No replacement-selection field. | `{token,state}`; 400 invalid input/extra fields, 401 incorrect credentials. |
| Read state          | `GET /api/mock/state`, bearer fake token                             | Read only the current token's player. Query player ids cannot select another account. Reading never signs a revoked session back in.                                   | 200 active snapshot; 401 removed/replaced/unknown token.                    |
| Start/resume lesson | `POST /api/mock/start-lesson`, bearer token, `{intentId,variantId?}` | Require the current token and stable key. Same receipt ledger as command:start; retries after expiry do not create another attempt. No new allocation.                 | 200 state; 401 removed/replaced token, 400 malformed/extra fields.          |
| Sign out            | `POST /api/mock/sign-out`, bearer token, empty body                  | Revoke only the caller's still-current token. A revoked former token cannot sign out the new session.                                                                  | `{signedOut:true}`; 401 removed/replaced token.                             |
| Reset fake world    | `POST /api/mock/dev-reset`                                           | Development-only fixture tool; restore fake accounts and invalidate all tokens.                                                                                        | `{reset:true}`; 404 in production.                                          |

`/api/mock/activate` is removed and returns 404. There is no inactive session, Continue action, device-slot chooser or `replaceDeviceId` field.

Error shape is `{error:{code,message}}`; never include a device list or token. Only INSUFFICIENT_AVAILABLE_FUNDS may include the strict public funds detail schema documented in the handoff. Known codes include `INVALID_USERNAME`, `INVALID_PIN`, `INVALID_DEVICE`, `INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `SESSION_REMOVED`, `SESSION_REPLACED`, `INVALID_REQUEST`, `BODY_TOO_LARGE`, `METHOD_NOT_ALLOWED`, `NOT_FOUND`, `DEMO_ERROR`.

## Revocation and presentation

A different-device successful login makes former-token state/start/sign-out requests return `SESSION_REPLACED/401`, with “You have signed in on another device.” The old UI clears its token/game state, shows a one-time acknowledgement and then the sign-in form. The new device enters normally. Same-device reauthentication also rotates the token but uses ordinary `SESSION_REMOVED/401`; logout/reset/unknown tokens likewise do not trigger a false other-device dialog.

Normal player screens show no session count, active-here status or mock device badge. Safe current-session labels remain only in development inspection data. Connected devices detect revocation on their next poll; offline/backgrounded devices detect it on reconnect. API checks enforce revocation immediately, independently of display latency.

## Input, ordering and recovery

PIN entry is a string of at most four ASCII digits, preserving leading zeros, with immediate feedback on rejected nonnumeric edits. The API independently rejects non-string, nonnumeric and non-four-digit PINs without truncation.

Authenticated snapshots include revision/time, player, own current-session metadata, funds and shared lesson. No inactive gameplay snapshot is returned. Monotonic revision/time and session-generation checks prevent late responses restoring revoked/logged-out state or clearing a later sign-in. Polling/visibility changes never create a new session.

Logout clears recovery credentials only after confirmed removal or a terminal removed/replaced response. Transport failure preserves retry context. Replacement discovered by a sign-out request still shows the required notice. Reset is disabled during mutations, clears busy state and guards delayed completion against a newer session generation.

The mock store can survive development module reload. Known Error-shaped failures are checked by declared code/status and bounded message; unknown/malformed/private device-list payloads remain generic 500. Session-schema changes can require a local preview restart; a restart intentionally restores temporary fixtures.

Phase2 lesson metadata includes id/start/deadline/status/remaining seconds and assessment pending/passed/not-passed. Clock expiry alone is not a pass. See [market commands, settlement and backend guide](phase-2.md). Switching login devices retains the same original 180-second deadline; assessment is local simulation only; no durable worker or production assessment service is claimed.

## Later Go/data mapping — draft

- Stable player identity and protected credential data separate from profile.
- One current authenticated session/token per player, with coordinated credential validation and revocation; ownership comes from the token.
- Revocation reason/version metadata sufficient for safe notifications; real expiry, retention and physical-device identity remain later design work.
- One shared player-owned active lesson id/deadline, separate from session identity and initial funding.

Do not derive final SQL columns one-to-one from these views. The mock does not establish production authentication, durable recovery or native Android/iOS guarantees.
