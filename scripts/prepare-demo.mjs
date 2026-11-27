// Disposable LOCAL fake profiles only. All progress and money flow through the
// same authenticated service commands as the UI; no direct state/grant endpoint.
const checkpoint = process.argv[2];
if (!["perpetual", "combined"].includes(checkpoint))
  throw Error("Use: node scripts/prepare-demo.mjs perpetual|combined");
const origin = "http://127.0.0.1:3100/api/mock/";
const probe = await fetch(origin + "dev-resources", {
  method: "POST",
  body: JSON.stringify({ hours: 0 }),
});
if (probe.status !== 401)
  throw Error(
    "Refusing to prepare fixtures: expected the local development-only mock API.",
  );
const account =
  checkpoint === "perpetual"
    ? { username: "visitor", pin: "0000" }
    : { username: "trader", pin: "0042" };
let token;
async function api(action, body) {
  const response = await fetch(origin + action, {
    method: body === undefined ? "GET" : "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(`${action}: ${data.error?.message ?? response.status}`);
  return data;
}
const command = async (body) =>
  (await api("command", { intentId: crypto.randomUUID(), ...body })).state;
try {
  const signed = await api("sign-in", {
    ...account,
    deviceId: "phase4-fixture-helper",
  });
  token = signed.token;
  if (signed.state.lesson?.status === "active")
    throw Error(
      "This fake profile has an active attempt. Finish it before preparing a checkpoint.",
    );
  const lessons = signed.state.course.lessons.filter(
    (l) =>
      l.group === "spot" ||
      (checkpoint === "combined" && l.group === "perpetual"),
  );
  for (const lesson of lessons)
    for (const variant of lesson.variants) {
      if (variant.passed) continue;
      const state = await command({ action: "start", variantId: variant.id }),
        a = state.lesson,
        symbol = a.recommendedAsset,
        quantity = a.defaultQuantity;
      const order = (extra) =>
        command({
          action: "order",
          attemptId: a.id,
          symbol,
          side: "buy",
          quantity,
          ...extra,
        });
      const perp = { product: "perpetual", leverage: 1 };
      if (lesson.id === "market") {
        await order({ symbol: "ETC", quantity: "1" });
        await order({ symbol: "ETC", quantity: "1", side: "sell" });
      } else if (lesson.id === "perp-direction") {
        await order(perp);
        await order({
          ...perp,
          symbol: symbol === "ETC" ? "SOL" : "ETC",
          quantity: "0.1",
          side: "sell",
        });
      } else if (["perp-collateral", "perp-size"].includes(lesson.id)) {
        await order(perp);
        const closed = await order({ ...perp, side: "sell", reduceOnly: true });
        await order(closed.lesson.comparison.nextOrder);
      } else if (lesson.id === "perp-liquidation")
        await order({ ...perp, leverage: 5 });
      else {
        const product = lesson.group === "perpetual" ? perp : {},
          defaults = a.form.defaults.find(
            (d) => d.symbol === symbol && d.side === "buy",
          );
        if (["ioc-fok", "perp-ioc-fok"].includes(lesson.id))
          for (const timeInForce of ["IOC", "FOK"])
            await order({
              ...product,
              orderType: "LIMIT",
              timeInForce,
              limitPrice: a.quotes.find((q) => q.symbol === symbol).price,
            });
        else
          await order({
            ...product,
            orderType: ["gtc", "perp-gtc"].includes(lesson.id)
              ? "LIMIT"
              : "STOP_LIMIT",
            timeInForce: "GTC",
            limitPrice: defaults.limitPrice,
            ...(["stop-limit", "perp-stop"].includes(lesson.id)
              ? { stopPrice: defaults.stopPrice }
              : {}),
          });
      }
      const done = await api("dev-advance", { attemptId: a.id, seconds: 180 });
      if (done.lesson.assessment !== "passed")
        throw Error(
          `Fixture did not satisfy ${variant.id}; nothing was force-unlocked.`,
        );
    }
  const final = await api("state");
  console.log(
    JSON.stringify({
      fakeAccount: account.username,
      checkpoint,
      completedScenarios: final.course.totalCompletedScenarios,
      perpetualsUnlocked: final.canUsePerpetuals,
      combinedUnlocked: final.course.perpetualPrerequisitesMet,
    }),
  );
} finally {
  if (token) await api("sign-out", {}).catch(() => {});
}
