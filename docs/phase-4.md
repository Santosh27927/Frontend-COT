> Historical phase slice. The current [backend handoff](backend-handoff.md) and [phase 5–11 guide](phase-5-11.md) supersede old asset names, collector settings, in-memory persistence and economy assumptions below.

# Phase 4 walkthrough

The browser prototype now has 36 scenarios: 12 spot, 21 perpetual and three combined. Each lesson needs three distinct passes. Business rules run in the Node mock service; React only captures intent, displays returned state and delivers commands. No Go/database, real market feed or venue SDK is needed.

## Start testing

Run the app at `http://127.0.0.1:3100`. For the full learning journey sign in as `learner / 0073`. Complete the spot course to enable Perpetuals in Learn.

To prepare disposable checkpoints without repeating earlier lessons:

```sh
node scripts/prepare-demo.mjs perpetual
node scripts/prepare-demo.mjs combined
```

The first prepares `visitor / 0000` after the spot course. The second prepares `trader / 0042` after the perpetual course. The helper is limited to the local development mock at port3100, refuses a profile with an active attempt, and signs its temporary session out afterward. It runs actual validated lesson commands; it does not grant progress or money directly. The service calculates the resulting demo balances. An already-completed variant is skipped. Restart/Reset Demo clears these temporary checkpoints. A new login signs out the previous device as before.

## Learning path

1. **Long and short at1x:** open both directions. Use different assets concurrently, or explicitly close before changing the direction on the same asset. Contract exposure never increases owned spot units or wallet cash. Close available uses a service-authored reduce-only request; the form also supports partial reductions.
2. **Same collateral:** open1x, close it fully, then use **Use 2x comparison quantity**. The service targets the baseline collateral at the current price. Quantity precision may leave a disclosed small difference. A previously placed2x trade, a partial close, wrong direction/asset or off-target quantity does not satisfy the sequence.
3. **Same size:** repeat with the same contract quantity at2x. Both lessons show actual fills and a separately labeled hypothetical10% favorable/adverse move, calculated from each fill's own entry price. These figures are not realized returns. At equal contract quantity, an equal absolute price move gives equal PnL regardless of leverage; the displayed 10% moves can differ in absolute size when the actual entry prices differ.
4. **Liquidation at5x:** open a position, observe adverse prices at+30 and the risk outcome at+60, then review20 seconds. The explanation shows equity, maintenance, execution price, recognized/raw PnL and the training backstop. No extra trade or quiz is required afterward.
5. **Perpetual GTC:** see margin reserved while the order waits, cancellation/release, then a pending order that fills. Immediately matchable limits use their actual execution price for margin and do not prove waiting.
6. **Perpetual IOC/FOK:** fill both immediate policies. Unmatchable orders cancel; partial liquidity is not simulated.
7. **Perpetual stop-limit:** see dormant placement, distinct trigger, then limit fill. A trigger alone does not pass.
8. **Combined:** open a perpetual position to commit margin. **Use margin-rejection spot example** copies a service-provided spot draft; it does not place it. Submit to experience the actual rejection and balance dialog. The explanation shows why cash committed to margin cannot fund that spot order. Reduce the quantity or release margin, then fill an affordable spot buy.

Each item has three examples. Developer lesson-clock controls can inspect30/60/80-second and deadline behavior quickly. Lesson time never accelerates resource production. Use the separate resource control for production tests.

## Timing, money and recovery

Every scenario still ends at its original180 seconds. Each required order anchors60 seconds plus20 review; the latest required acceptance controls Fast-forward, and later required outcomes get their final20-second review. A late attempt can pass on actual completed trading requirements without enough time to offer Fast-forward. Reconnecting counts elapsed time and restores actual events rather than starting over.

First-time outcomes affect the continuing Demo USD balance. Opening commits margin without spending notional or creating spot assets. Reducing/closing realizes PnL once. At the endpoint remaining lesson contracts close, pending claims release, and unrelated owned assets remain. Replaying completed scenarios uses isolated practice; reports are immutable owned history.

Known browser-offline status disables fresh actions and blocks creation/storage of a new intent, including cached Close instructions. Draft fields remain editable; an uncertain submitted intent still locks edits until resolved. A command already uncertain retains its original payload/key for explicit retry. A failure during a request can still have an unknown outcome; reconnect must resolve that original intent before a new action. Advisory preview/retry never creates a trade.

This uses COT's `isolated-training-v1`:1% maintenance rounded up, weighted basis, isolated loss cap and explicit gap backstop. Fees/funding/slippage remain zero with unlimited simulated liquidity. These are versioned teaching rules, not exchange-equivalent risk. XRP1/hour/cap50 remains; SOL/ETH production and later economy decisions stay unconfigured.

See [backend-handoff.md](backend-handoff.md) for DTOs, exact effects, owned records, API errors and later Go transaction requirements. Browser checks do not prove physical Android lifecycle behavior, durable recovery or production financial/security correctness.
