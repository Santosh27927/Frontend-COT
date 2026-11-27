# Optional learning questions —12-item content draft

Status: **CONTENT AND OPTIONAL PLACEMENT APPROVED; IMPLEMENTATION PENDING.** Correct answer and Explanation are separate fields/blocks. Unlimited free wrong retries; one payout on first correct completion:5 Demo USD on attempt1,2.50 on ANY later attempt. Persisted accepted grading attempts/paid identity prevent network retries,logout,restart or text revision from resetting rewards. Review copy contains the answer key;public question payload does not own grading. COT simulated training rules only.

Selected placement: optional activity after a lesson's three scenarios, learning-hub access later, no trading-progression/Fast-forward gate. Stable question ID and persisted accepted grading attempts prevent text changes, network replay, logout or server restart from resetting reward history.

1. **Market orders — market-value**
   You own2 ETC. Its displayed market price rises. What changes immediately?
   A. Your2 ETC stay the same quantity, while their displayed value increases.
   B. Your ETC quantity increases automatically.
   C. The price rise automatically becomes spendable USD without selling.
   **Correct answer: A**

   **Explanation:** Price changes valuation; it does not create asset units or automatically realize a sale.

2. **GTC limit orders — gtc-pending**
   Your accepted GTC order is currently unmatched and shows Pending. What does that mean?
   A. The trade is already filled.
   B. The order is waiting for a matching execution.
   C. It has become a perpetual position.
   **Correct answer: B**

   **Explanation:** Acceptance/pending is different from a fill. COT's guided scenario supplies its scripted matching event separately.

3. **IOC/FOK — spot-fok**
   Which policy requires the complete requested quantity to be immediately executable, otherwise it cancels?
   A. FOK.
   B. GTC.
   C. Neither; both always wait.
   **Correct answer: A**

   **Explanation:** FOK is all-or-none immediately. The prototype's guided liquidity settings are simulation settings, not guarantees about live markets.

4. **Spot stop-limit — spot-trigger**
   Your stop has triggered and activated its limit order. Is that alone proof the trade filled?
   A. Yes, triggering always proves a fill.
   B. No, the activated limit order still needs a matching execution.
   C. Yes, and it doubles the quantity.
   **Correct answer: B**

   **Explanation:** Trigger, activation and fill are distinct events.

5. **Long/short at1x — one-direction**
   In this prototype, you have an open long in BTC and want a BTC short. What follows the selected rule?
   A. Open both directions on BTC simultaneously.
   B. Close BTC's existing direction before reversing; use a different asset for simultaneous opposite directions.
   C. Increase leverage to bypass the direction rule.
   **Correct answer: B**

   **Explanation:** The service allows one direction per asset at a time; leverage does not bypass it.

6. **Same-collateral comparison — collateral-exposure**
   At the same entry price, compare100 USD collateral at1x versus2x. Which has greater initial notional exposure?
   A.1x.
   B.2x, with twice the initial notional.
   C. They always have identical exposure.
   **Correct answer: B**

   **Explanation:** With collateral held constant, leverage increases notional exposure and changes the impact of a given price movement.

7. **Same-size comparison — size-margin**
   For the same position quantity and entry price, how does required initial collateral at2x compare with1x in the training model?
   A. Half as much.
   B. Twice as much.
   C. No collateral is required.
   **Correct answer: A**

   **Explanation:** At equal notional, initial collateral is notional divided by leverage. This comparison holds quantity and entry price constant.

8. **Isolated liquidation at5x — isolated-scope**
   Under COT's selected isolated-training liquidation rule, which funds secure that position?
   A. The collateral committed to that position.
   B. Every asset in the entire wallet.
   C. Uncollected resources in both collectors.
   **Correct answer: A**

   **Explanation:** The training rule isolates the position's collateral; its gap/backstop behavior is not a live-exchange guarantee.

9. **Perpetual GTC — perp-pending**
   A perpetual GTC order was accepted but is still pending. Has acceptance alone opened the filled position?
   A. Yes.
   B. No, a matching fill is still required.
   C. Yes, because it uses leverage.
   **Correct answer: B**

   **Explanation:** Order acceptance and position execution are separate events.

10. **Perpetual IOC/FOK — perp-fok-cancel**
    A perpetual FOK order cannot execute its complete requested size immediately. What should happen under that policy?
    A. It remains pending indefinitely.
    B. It cancels instead of leaving a waiting or partially filled FOK order.
    C. It automatically switches to a market order.
    **Correct answer: B**

   **Explanation:** FOK does not silently become a waiting GTC or another order type.

11. **Perpetual stop-limit — perp-trigger**
    Which sequence demonstrates the full guided stop-limit outcome?
    A. Placement→trigger/activation→matching limit fill.
    B. Placement→trigger only.
    C. Placement→conversion bonus.
    **Correct answer: A**

   **Explanation:** The lesson requires the actual fill after activation, not merely observing a trigger.

12. **Spot/margin shared wallet — available-cash**
    Your cash balance is100 USD, with80 committed to margin. How much is available for a new spot purchase before any other restrictions?
    A.100 USD.
    B.20 USD.
    C.180 USD.
    **Correct answer: B**

   **Explanation:** Committed margin cannot also fund a spot buy. Releasing it can change availability; a new trade still needs all other service validations.

Only first CORRECT completion pays:5 USD on attempt1,2.50 on attempt2 or any later attempt. Wrong/repeated paid answers pay0;initial bank maximum60 if all first-attempt correct. Full-wallet owed reward becomes protected pending credit. Grading/paid identity/reward-or-pending are atomic;later claim transfers existing reward without another payout.
