# Selected wallet limits,collectors and construction

Current authority: BACKEND_HANDOFF.md R05/R06. User selected these values;engineering rounding/transaction details remain reviewed implementation choices. Prior BTC0.034 and mixed-payment suggestions are superseded.

| Asset |Wallet limit |Base collector |Level2 collector |
| --- | --- | --- | --- |
| Demo USD |2,000 USD |None |None |
| ETC |350 ETC,fixed units |1/hour,store50 |2/hour,store100 |
| SOL |20 SOL,fixed units |None |None |
| BTC |No gameplay wallet cap |0.0001/hour,store0.005 |0.0002/hour,store0.01 |

Initial ETC/SOL limits were derived from roughly2,000 USD reference budget then rounded down:2,000/5.6845≈351.833934→350 ETC;2,000/100=20 SOL. ETC/BTC historical references are in REFERENCE_QUOTES.json;SOL100 is a mock reference,not a live price. Fixed units stay fixed when price moves. Combined portfolio value may exceed2,000. BTC collector storage remains limited even though its wallet is uncapped.

Town Hall1→2:12 spot scenarios,100 USD-equivalent ONE allowed asset,12h,unlocks collector2. ETC1→2:0.001 BTC/12h;BTC1→2:10 ETC/12h. Each collector price is10 hours of the opposite base production. Old production/store continues during construction;new values at completion,no retroactive backfill. Both collector levels store50 hours. Wallet caps do not increase automatically.

20 concurrent builds for Town Hall1/2,one per building. Current small catalog cannot normally reach20;boundary fixtures exercise20/21 without adding player copies. Unlocked learning continues. Cancel refunds50%original paid units after exact loss/refund acknowledgement;excess/subunit entitlement remains owed. At/after completion no new cancellation. Restart uses full new price/time/ID;old events and receipts cannot affect replacement.

Optional purchases/conversion must fit all destination entitlement including25%bonus;otherwise reject before effects. Resource collection transfers only room,leaves rest in collector. Profits/refunds/earned rewards preserve excess as unspendable pending credit. Manual claim transfers representable room,retains remainder,does not create another reward/PnL entry. R04 preserves fractional source change/bonus/refund rather than silently rounding away ownership.

See CONFIGURATION.md for runtime policy changes,accepted promise preservation and future back-office controls. No application data reset or implementation validation is implied by this view.
