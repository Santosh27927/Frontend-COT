> Historical phase slice. The current [backend handoff](backend-handoff.md) and [phase 5–11 guide](phase-5-11.md) supersede old asset names, collector settings, in-memory persistence and economy assumptions below.

# Phase3 walkthrough

Run `npm run dev -- --port 3100`. Sign in with fake `learner / 0073` and open the first lesson. This local simulation needs no Go/database. See [backend-handoff.md](backend-handoff.md) for all rule ownership, requests, effects, data and integration gaps.

1. The order form shows server-provided available/reserved balance and maximum instrument quantity. Change assets or side to see the appropriate limit. An unaffordable submit opens a focused balance/maximum dialog. Every actual order revalidates; preview never authorizes a trade.
2. Complete three market scenarios. Watch60 seconds plus20 review or use the development-only lesson controls to inspect checkpoints quickly.
3. GTC unlocks. A suggested limit waits, then fills60 seconds after acceptance. Observe reserved cash and reduced maximum for additional orders; cancel a pending order to release it. Immediate GTC fills do not demonstrate waiting.
4. Complete three GTC scenarios to unlock IOC/FOK and earn the SOL marker. Fill both policies per scenario, using Order policy. Unmatchable examples cancel immediately. Neither policy waits60 seconds to execute; observation remains separate.
5. Complete three IOC/FOK scenarios to unlock Stop-limit. Observe dormant → triggered at+30 → filled at+60, then review. Complete its three scenarios for the ETH marker and full spot prerequisite progress.
6. On Village, the XRP generator produces1/hour, stores50 maximum and collects into owned XRP. Developer tools can advance resources independently to inspect1hour/full-storage behavior. SOL/ETH production settings remain pending, even after their award markers appear.
7. Replay any completed attempt without financial effects. Repeating a passed example uses isolated practice. Select a replay asset to inspect its own historical chart.

Dark and light themes use semantic matching surfaces/ink. Validation covers result/replay/forms/dialogs, focus and mobile geometry. New tests cover reservations, exact preview/error envelopes, guided/base ordering, stop boundaries, two-policy observation,12 distinct progress, resource cap/fraction/atomicity, collection during real/practice attempts, lost-response recovery and current-session ownership.

Phase4 perpetual/combined simulation is implemented; see [phase-4.md](phase-4.md). Physical Android interaction/lifecycle remains unverified. All business rules remain on the service side. Native packaging and production Go integration are not implemented by this phase.
