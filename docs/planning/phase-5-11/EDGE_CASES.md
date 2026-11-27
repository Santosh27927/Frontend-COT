# Requirement-driven validation plan

**All future-feature cases PLANNED / NOT RUN.** Inputs/expected outcomes come from selected user decisions and contract,not future implementation outputs. Existing71/57 Phase4 counts are historical. Native checks are feasibility only.

| Case family | Requirement | Allowed operation / expected result | Unsafe operation / expected rejection |
| --- | --- | --- | --- |
|EC-F-identity |F |Current token reads/acts on own state |Revoked/foreign token cannot read or mutate another wallet |
|EC-F-catalog |F |Approved explicit new-catalog reset backs up disposable state;36 lesson goals survive |Old asset payload/corrupt startup cannot silently rename holdings or allocate new1,000 |
|EC-F-practice |F |Real/practice and frozen reports remain separate with lesson-lots-sold-first |Practice or price-path reset cannot change continuing balance/completed result |
|EC-CFG-versions |CFG |New valid policy affects new quotes;accepted build keeps cost/time/refund/effects |Player override or malformed/missing price/cap cannot mean free/unlimited |
|EC-CFG-slots |CFG |20 fixture buildings allowed;lower20→5 keeps10 existing and waits for space |21st or second active same building rejects without charge;no forced cancel |
|EC-CFG-effective |CFG |Old/new production intervals apply at explicit effective time |No retroactive rate multiplication,cap truncation or full-store backfill |
|EC-MKT-marks |MKT |Converter→lesson→old-holding sale uses anchored coherent mock marks |No unrelated lesson-entry price reset or live-looking invented provider |
|EC-MKT-prices |MKT |Fresh complete owned snapshot and isolated practice market |Zero/negative/future/missing/partial bundle is unavailable,practice cannot revalue real wallet |
|EC-CONV-fixed |CONV |Available100 converts nominal50 with25%base entitlement and change |Below50,client amount/price/reward,same-asset,unsupported USDT reject before effects |
|EC-CONV-boundary |CONV |Available exactly50 passes funds check;nearest valid below-target quantity disclosed |49.999999999999 not rounded into eligibility;no insufficient-balance partial action |
|EC-CONV-oracle |CONV |Synthetic USD100/BTCprice3:base16.66666666;change0.00000002;bonus4.166666665 incl half-atom owed |Zero base,9th BTC input decimal,JSON numeric money,overflow or dropped owed fraction reject |
|EC-CONV-lock |CONV |After12 spots first use immediate;success locks48h and endpoint eligible |Beforeunlock/duringdemo/before48h/bonus-disabled bypass rejects;failedquote doesnotconsume |
|EC-QTE-expiry |QTE |Confirm justbefore30s or replay old success afterexpiry |Newconfirm at/after30s or changedquote requires reconfirmation,not silentprice |
|EC-QTE-replay |QTE |Lost reply then originalkey returns old receipt plus reconciled deadlines |New key consumedquote,changedpayload,doubletap or unknownstate cannot duplicate effect |
|EC-WAL-caps |WAL |USD2,000 ETC350 SOL20;BTC above old0.034 is valid within technical bounds |Missing cap is unconfigured;no dynamic resizing/forcedsale from price change |
|EC-WAL-room |WAL |Complete base+bonus exactfit succeeds with current inboundheadroom |Base-onlyfits or competing buy/conversion cannot overbook destination |
|EC-WAL-collection |WAL |ETC330 wallet/50store transfers20 and leaves30 |Zero room/activedemo cannot transfer or lose store;no backfill |
|EC-WAL-pending |WAL |USD1,990 plus50owed→2,000wallet/40pending;claim only room later |Fullwallet cannot destroy profit/refund/block exit;claim cannot add PnL twice |
|EC-WAL-fractions |WAL |Odd half-unit refund retained as exact owed fraction until representable |Two independent half-atom origins aggregate into one claimable atom with FIFO origin allocations;no double PnL,rounding writeoff,duplicate claim or fractional credit loosening order steps |
|EC-WAL-reserved |WAL |Owned reserved units/committedcash count;perp notional is not spot inventory |Moving money to margin cannot create fake storage/assistance eligibility |
|EC-PROD-rates |PROD |ETC1/store50→2/store100;BTC.0001/.005→.0002/.01 both50h |No1BTC/hour default or wallet-cap increase from collector-store upgrade |
|EC-PROD-time |PROD |Old values while upgrading,new at12h;offline intervals capped |No lesson skip/deviceclock acceleration,retroactive income or canceled effect |
|EC-UPG-prices |UPG |12spots thenTH100-equivalent;TH2 permits ETCupg.001BTC/BTCupg10ETC,12h |Wrong minedasset,mixedUSD40+ETC60,missingprereq or activedemo rejects,no autoconvert |
|EC-UPG-completion |UPG |Durable start retains oldlevel;unlocked play continues;one completion |Duplicate start/early completion/reconnect timer reset cannot charge/grant twice |
|EC-CAN-ack |CAN |Pay10ETC,cancel withack→5ETCoriginalunit refund/loss5 |False/missingack,foreign/stalepreview or repricedrefund reject |
|EC-CAN-race |CAN |Beforedeadline one cancel;at/afterdeadline one completion |Cancel and complete cannot both win;failed refund cannot leave canceled unpaid state |
|EC-CAN-restart |CAN |New fullcost/timer/ID aftercancel;old successful cancel replay after olddeadline |Oldtimer/start/cancel cannot affect replacement;no automatic50discount/resumedtime |
|EC-QUIZ-rewards |QUIZ |Firstcorrectattempt1 pays5;anylaterfirstcorrect pays2.50,once |Wronganswer0,paidreplay0;no furtherhalving or5+2.50 accumulation |
|EC-QUIZ-attempts |QUIZ |Accepted wronggrade persists acrossrestart;network replay is sameattempt |Logout/revision/stalequestion/forgedcorrect cannot reset/gradeunseencontent/paytwice |
|EC-QUIZ-feedback |QUIZ |Skip allowed;Correctanswer ownblock and Explanation below |No quiz progressiongate,inline mergedfeedback or silentlyconsumed unpaid reward |
|EC-HELP-grant |HELP |Spendable20/norecovery/configuredfiniteoffer→claim100→120 |Exactly50,changedfunds>=50,clientamount or80targettopup cannot grant |
|EC-HELP-recovery |HELP |Spendable20+lockedBTC mayqualify if genuine recovery unavailable |Merelyreserve100→20 or treatfailedread aszerofunds cannotqualify |
|EC-HELP-cadence |HELP |Finite developmentpreset permits one claim perplayer;history persists |Unconfigured ordinarycadence,reloginquota reset or duplicateoffer cannot grantunlimited |
|EC-PER-restart |PER |Persist exactwallet/quotes/receipts/builds/credits/attempts/session/policy before response |Restart cannot refill1,000/resetattempts/timers;corrupt/unsupportedstorefails notauto-reset |
|EC-PER-crash |PER |Crashafterdurablecommit/beforereply recovers sameintent;dueevents replayonce |Partialwrite,debit/paidmarker failure or secondwriter cannot publish partialsuccess |
|EC-PER-delivery |PER |Saveintentbeforesend;currentowner recovers,lateoldreplyignored |Cannot saveintent/knownoffline/fakeoldowner means no freshfinancialsend/leak |
|EC-UX-landscape |UX |Landscape/portraitfallback,keyboard,focus,light/dark and empty/loading/error visible |No white-on-white result,hidden storageerror or stale cachedpermission |
|EC-UX-authority |UX |Client captures readonlyconverter/ack and renders service capability/amount |DirectHTTP cannot override balance/grading/timer/cap/unlock using browserflags |
|EC-HAND-trace |HAND |Each control/policy linked to service/records/receipt and actual/planned evidence |No mockpass equals Go/database/nativebuild/liveproof or unrelatedrepo work |
|EC-HAND-native |HAND |AndroidtheniOS feasibility documents reachable API/storage/lifecycle gaps |No clientfinancialNodefallback,unselectednativeproject/signing/store/deployment |

## Execution strategy

Unit/domain:exact math,policy,headroom,grading and accrual. Actual mockHTTP:shape/status/error/ownership. Browser:real journeys,keyboard/focus/theme/landscape/uncertain delivery. Isolated process restart/fault injection:persistence. Controlled clocks/profiles;no time-sleep flakiness.

Independent oracles include R04 synthetic arithmetic,20→120 grant,5/2.50first-correct payout,exact50/30s/48h/12h boundaries and original-unit refund. No expected values copied from production helpers. Narrow guard-removal checks prove critical receipt/expiry/owner/cap assertions fail without behavior.

Go/database/worker races,native packaging/signing/store and finalmobileart remain unverified/excluded. Report actual positives/failures/unrun cases separately;counts/reviews alone are not execution proof.

Additional explicit precision boundary: BTC0.00000001 at58639.4050 is exactUSD0.000586394050 at12 decimals. A supplied BTC price58639.405001 exceeds advertised4-price-decimal tick and rejects before effects;do not silently truncate. Generated marks obey tick metadata. ETC/SOL6+6 inputs remain allowed.
