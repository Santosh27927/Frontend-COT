# Selected economy and calibration

Current contract: BACKEND_HANDOFF.md. All monetary resources are simulated. ETC/BTC names do not represent real mining yields.

Selected base ETC1/hour/store50 and BTC0.0001/hour/store0.005;selected level2 doubles both rate and store,retaining50 hours offline capacity. Wallet limits are separate:USD2,000,ETC350,SOL20,BTC no gameplay cap.

The dated reference values ETC5.6845 USD and BTC58,639.405 USD from REFERENCE_QUOTES.json explain the original parity proposal:1 ETC/hour≈5.6845 USD/hour;0.0001 BTC/hour≈5.8639405 USD/hour. Their sum11.5484405 USD/hour is combined VALUE only,not necessarily an eligible single-asset payment. No provider/real-time conversion source is selected by that calibration. Runtime uses a shared MOCK market stream,not these responses as live quotes.

Selected Town Hall cost100 USD equivalent is10% of starting1,000;12-hour construction is additional to acquiring funds. At frozen references from zero,ETC alone takes≈17.59h to produce100-value units,BTC alone≈17.05h. Combined≈8.66h is not single-asset affordability because mixing is rejected. These are arithmetic examples,not a promise after losses or price movement.

Collector1→2 costs10 ETC or0.001 BTC,each10 hours of opposite base production. One50 nominal conversion yields at most62.50 destination value before unit effects,so at these references one can fund either collector upgrade;another conversion still waits48h. The player chooses a strategy;no automatic conversion or smaller amount bypass.

Conversion25% on nominal50 means at most12.50 USD extra per use;15 nominal uses add at most187.50 before rounding/price movement. Full-wallet25%compounding is not permitted. Quiz maximum60 if all12 first-attempt correct,otherwise2.50 on later first-correct. Assistance selected100 extra only below50 spendable USD with recovery checks;frequency/repeat budget intentionally deferred,never unlimited due to missing config.

Final mobile art,real markets,Go/database/native/back-office/deployment remain outside this prototype. Refer to CONFIGURATION.md for runtime tuning and explicit recipient handoffs.
