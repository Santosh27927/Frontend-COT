import { test, expect } from "@playwright/test";
import type { Page, APIRequestContext } from "@playwright/test";
import type { PlayerState } from "../src/api/types";
import type { LessonId, OrderDraft } from "../src/api/market-types";

async function login(p: Page) {
  await p.goto("/?device=A");
  await p.getByLabel("Account name").fill("learner");
  await p.getByLabel("Four-digit PIN").fill("0073");
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(p.getByRole("navigation")).toBeVisible();
}
async function headers(p: Page) {
  return {
    Authorization: `Bearer ${await p.evaluate(() => sessionStorage.getItem("cot.demo.token.A"))}`,
  };
}
async function snapshot(p: Page, r: APIRequestContext): Promise<PlayerState> {
  const res = await r.get("/api/mock/state", { headers: await headers(p) });
  expect(res.status()).toBe(200);
  return res.json();
}
async function command(
  p: Page,
  r: APIRequestContext,
  data: Record<string, unknown>,
  status = 200,
): Promise<PlayerState> {
  const res = await r.post("/api/mock/command", {
    headers: await headers(p),
    data: { intentId: crypto.randomUUID(), ...data },
  });
  expect(res.status()).toBe(status);
  const body = await res.json();
  return body.state;
}
async function advance(p: Page, r: APIRequestContext, seconds: number) {
  const s = await snapshot(p, r);
  const res = await r.post("/api/mock/dev-advance", {
    headers: await headers(p),
    data: { attemptId: s.lesson!.id, seconds },
  });
  expect(res.status()).toBe(200);
}
const path: LessonId[] = [
  "market",
  "gtc",
  "ioc-fok",
  "stop-limit",
  "perp-direction",
  "perp-collateral",
  "perp-size",
  "perp-liquidation",
  "perp-gtc",
  "perp-ioc-fok",
  "perp-stop",
  "combined",
];
async function seedBefore(p: Page, r: APIRequestContext, target: LessonId) {
  for (const id of path) {
    if (id === target) break;
    for (const asset of ["etc", "sol", "btc"]) {
      const s = await command(p, r, {
          action: "start",
          variantId: `${id}-${asset}`,
        }),
        a = s.lesson!,
        symbol = a.recommendedAsset,
        quantity = a.defaultQuantity;
      const order = (d: Partial<OrderDraft>, status = 200) =>
        command(
          p,
          r,
          {
            action: "order",
            attemptId: a.id,
            symbol,
            side: "buy",
            quantity,
            ...d,
          },
          status,
        );
      const perp = { product: "perpetual" as const, leverage: 1 };
      if (id === "market") {
        await order({ symbol: "ETC", quantity: "1" });
        await order({ symbol: "ETC", quantity: "1", side: "sell" });
      } else if (id === "perp-direction") {
        await order(perp);
        await order({
          ...perp,
          side: "sell",
          symbol: symbol === "ETC" ? "SOL" : "ETC",
          quantity: "0.1",
        });
      } else if (id === "perp-collateral" || id === "perp-size") {
        await order(perp);
        const closed = await order({ ...perp, side: "sell", reduceOnly: true });
        await order(closed.lesson!.comparison!.nextOrder!);
      } else if (id === "perp-liquidation")
        await order({ ...perp, leverage: 5 });
      else {
        const product = id.startsWith("perp-") ? perp : {};
        const d = a.form.defaults.find(
          (d) => d.symbol === symbol && d.side === "buy",
        )!;
        if (id === "ioc-fok" || id === "perp-ioc-fok")
          for (const timeInForce of ["IOC", "FOK"] as const)
            await order({
              ...product,
              orderType: "LIMIT",
              timeInForce,
              limitPrice: a.quotes.find((q) => q.symbol === symbol)!.price,
            });
        else
          await order({
            ...product,
            orderType:
              id === "gtc" || id === "perp-gtc" ? "LIMIT" : "STOP_LIMIT",
            timeInForce: "GTC",
            limitPrice: d.limitPrice,
            ...(id === "stop-limit" || id === "perp-stop"
              ? { stopPrice: d.stopPrice }
              : {}),
          });
      }
      await advance(p, r, 180);
      expect((await snapshot(p, r)).lesson!.assessment).toBe("passed");
    }
  }
}
async function open(p: Page, r: APIRequestContext, lesson: LessonId) {
  await seedBefore(p, r, lesson);
  await command(p, r, { action: "start", variantId: `${lesson}-etc` });
  await p
    .getByRole("navigation")
    .getByRole("button", { name: "Learn", exact: true })
    .click();
  await expect(p.getByLabel("Quantity")).toBeVisible();
  await expect(
    p.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
}
async function visual(p: Page) {
  for (const width of [320, 390, 736]) {
    await p.setViewportSize({ width, height: 900 });
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await p.setViewportSize({ width: 390, height: 844 });
  const failures = await p.locator(".position-area").evaluate((root) => {
    const rgb = (s: string) => s.match(/[\d.]+/g)!.map(Number);
    const lum = (v: number[]) =>
      v
        .slice(0, 3)
        .map((x) =>
          x / 255 <= 0.04045
            ? x / 255 / 12.92
            : ((x / 255 + 0.055) / 1.055) ** 2.4,
        )
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const issues: string[] = [];
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walk.nextNode())) {
      if (!n.textContent?.trim()) continue;
      const e = n.parentElement!;
      if (!e.getClientRects().length) continue;
      let bg = [255, 255, 255],
        chain: Element[] = [];
      for (let x: Element | null = e; x; x = x.parentElement) chain.unshift(x);
      for (const x of chain) {
        const c = rgb(getComputedStyle(x).backgroundColor),
          a = c[3] ?? 1;
        bg = bg.map((v, i) => c[i] * a + v * (1 - a));
      }
      const a = lum(rgb(getComputedStyle(e).color)),
        b = lum(bg),
        contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (contrast < 4.5) issues.push(n.textContent.trim().slice(0, 70));
    }
    return issues;
  });
  expect(failures).toEqual([]);
}
test.beforeEach(async ({ request }) => {
  await request.post("/api/mock/dev-reset");
});
for (const colorScheme of ["light", "dark"] as const)
  test(`V/U/P/T: ${colorScheme} unlocked long/short, explicit close, shared cash and result/replay`, async ({
    page: p,
    request: r,
  }) => {
    test.setTimeout(90000);
    await p.emulateMedia({ colorScheme });
    await login(p);
    await expect(
      p.getByRole("button", { name: "Perpetuals · locked", exact: true }),
    ).toHaveCount(0); // Village has no routine product controls.
    await open(p, r, "perp-direction");
    await expect(
      p.getByRole("button", { name: "Perpetuals", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await p.getByLabel("Quantity").fill("1");
    await p
      .getByRole("button", { name: "Place buy order", exact: true })
      .click();
    await expect(p.getByLabel("ETC position")).toContainText("Long · 1x");
    const owned = (await snapshot(p, r)).lesson!.wallet.holdings.map(
      (h) => h.quantity,
    );
    await p.getByRole("button", { name: "Sell", exact: true }).click();
    await p.getByLabel("Asset", { exact: true }).selectOption("SOL");
    await p.getByLabel("Quantity").fill("0.1");
    await p
      .getByRole("button", { name: "Place sell order", exact: true })
      .click();
    await expect(p.getByLabel("SOL position")).toContainText("Short · 1x");
    await expect(p.locator(".goal-list")).not.toContainText("○");
    expect(
      (await snapshot(p, r)).lesson!.wallet.holdings.map((h) => h.quantity),
    ).toEqual(owned);
    await visual(p);
    await p
      .getByLabel("Perpetual positions")
      .screenshot({ path: `test-results/phase4-${colorScheme}-positions.png` });
    await p
      .getByRole("button", { name: "Close available ETC", exact: true })
      .click();
    await expect(p.getByLabel("ETC position")).toHaveCount(0);
    await advance(p, r, 80);
    await expect(
      p.getByRole("button", { name: "Fast-forward", exact: true }),
    ).toBeVisible();
    await p.getByRole("button", { name: "Fast-forward", exact: true }).click();
    await expect(p.getByLabel("Scenario result")).toContainText(
      "Trading requirement met",
    );
    await expect(p.getByLabel("Position closing history")).toContainText(
      "realized PnL",
    );
    await p.getByRole("button", { name: "View replay", exact: true }).click();
    await expect(p.getByLabel("Scenario replay")).toContainText(
      "Position closes and realized PnL",
    );
  });
for (const colorScheme of ["light", "dark"] as const)
  for (const lesson of ["perp-collateral", "perp-size"] as const)
    test(`C/V: ${colorScheme} actual ${lesson}1x-close-2x with updated target and preserved typed quantity`, async ({
      page: p,
      request: r,
    }) => {
      test.setTimeout(90000);
      await p.emulateMedia({ colorScheme });
      await login(p);
      await open(p, r, lesson);
      await p.getByLabel("Quantity").fill("1");
      await p
        .getByRole("button", { name: "Place buy order", exact: true })
        .click();
      await expect(p.getByLabel("Leverage comparison")).toContainText(
        "1x baseline",
      );
      await p
        .getByRole("button", { name: "Close available ETC", exact: true })
        .click();
      await advance(p, r, 30);
      const updated = await snapshot(p, r);
      await expect(p.getByLabel("Current ETC price")).toContainText(
        "$" + updated.lesson!.quotes.find((q) => q.symbol === "ETC")!.price,
      );
      await expect(p.getByLabel("Quantity")).toHaveValue("1");
      await p
        .getByRole("button", {
          name: "Use 2x comparison quantity",
          exact: true,
        })
        .click();
      await expect(p.getByLabel("Leverage", { exact: true })).toHaveValue("2");
      await expect(p.getByLabel("Quantity")).toHaveValue(
        updated.lesson!.comparison!.targetQuantity!,
      );
      await p
        .getByRole("button", { name: "Place buy order", exact: true })
        .click();
      await expect(p.locator(".goal-list")).not.toContainText("○");
      await visual(p);
      await p.getByLabel("Leverage comparison").screenshot({
        path: `test-results/phase4-${colorScheme}-${lesson}-comparison.png`,
      });
      await advance(p, r, 80);
      await p
        .getByRole("button", { name: "Fast-forward", exact: true })
        .click();
      await expect(p.getByLabel("Scenario result")).toContainText(
        "Trading requirement met",
      );
    });
for (const colorScheme of ["light", "dark"] as const)
  test(`L/V/T: ${colorScheme}5x outcome shows factual liquidation, isolated cap/backstop and review`, async ({
    page: p,
    request: r,
  }) => {
    test.setTimeout(90000);
    await p.emulateMedia({ colorScheme });
    await login(p);
    await open(p, r, "perp-liquidation");
    await expect(p.getByLabel("Leverage", { exact: true })).toHaveValue("5");
    await p
      .getByRole("button", { name: "Place buy order", exact: true })
      .click();
    await expect(p.getByLabel("ETC position")).toBeVisible();
    await advance(p, r, 30);
    await expect(p.getByLabel("ETC liquidation")).toHaveCount(0);
    await advance(p, r, 30);
    const actual = (await snapshot(p, r)).lesson!.liquidations![0];
    await expect(p.getByLabel("ETC liquidation")).toContainText(
      "Recognized PnL: $" + actual.realizedPnl,
    );
    await expect(
      p.getByRole("button", { name: "Fast-forward", exact: true }),
    ).toHaveCount(0);
    await visual(p);
    await p.getByLabel("ETC liquidation").screenshot({
      path: `test-results/phase4-${colorScheme}-liquidation.png`,
    });
    await advance(p, r, 20);
    await p.getByRole("button", { name: "Fast-forward", exact: true }).click();
    await expect(p.getByLabel("Scenario result")).toContainText(
      "Trading requirement met",
    );
    expect((await snapshot(p, r)).lesson!.result!.liquidations!.length).toBe(1);
  });
test("O/U: perpetual GTC, both immediate policies and separate stop complete nine UI scenarios then unlock combined", async ({
  page: p,
  request: r,
}) => {
  test.setTimeout(120000);
  await login(p);
  await open(p, r, "perp-gtc");
  for (const id of ["perp-gtc", "perp-ioc-fok", "perp-stop"])
    for (let i = 0; i < 3; i++) {
      await expect(p.getByLabel("Perpetual lesson")).toHaveValue(id);
      await p
        .getByRole("button", { name: "Place buy order", exact: true })
        .click();
      await expect(p.locator(".fill-history")).toBeVisible();
      if (id === "perp-gtc" && i === 0) {
        await expect(p.getByLabel("Your pending ETC order")).toBeVisible();
        await p
          .getByRole("button", {
            name: "Cancel pending ETC order",
            exact: true,
          })
          .click();
        await expect(p.locator(".fill-history")).toContainText("CANCELED");
        await p
          .getByRole("button", { name: "Place buy order", exact: true })
          .click();
      }
      if (id === "perp-ioc-fok") {
        await p.getByLabel("Order policy").selectOption("LIMIT:FOK");
        await p
          .getByRole("button", { name: "Place buy order", exact: true })
          .click();
      }
      if (id === "perp-stop") {
        await advance(p, r, 30);
        await expect(
          p.getByLabel(`Your pending ${["ETC", "SOL", "BTC"][i]} order`),
        ).toContainText("Stop activated");
        await p.screenshot({
          path: "test-results/phase4-stop-trigger.png",
          fullPage: true,
        });
      }
      await advance(p, r, 180);
      await expect(p.getByLabel("Scenario result")).toContainText(
        "Trading requirement met",
      );
      if (!(id === "perp-stop" && i === 2))
        await p
          .getByRole("button", { name: "Next scenario", exact: true })
          .click();
    }
  await expect(
    p.getByRole("button", { name: "Combined", exact: true }),
  ).toBeEnabled();
  expect((await snapshot(p, r)).course.totalCompletedScenarios).toBe(33);
});
for (const colorScheme of ["light", "dark"] as const)
  test(`S/V/H: ${colorScheme} committed margin causes real spot rejection dialog, factual explanation and affordable correction`, async ({
    page: p,
    request: r,
  }) => {
    test.setTimeout(120000);
    await p.emulateMedia({ colorScheme });
    await login(p);
    await open(p, r, "combined");
    await p
      .getByRole("button", { name: "Place buy order", exact: true })
      .click();
    await expect(p.getByLabel("ETC position")).toBeVisible();
    const before = await snapshot(p, r);
    await p
      .getByRole("button", {
        name: "Use margin-rejection spot example",
        exact: true,
      })
      .click();
    await expect(p.getByLabel("Trading product")).toHaveValue("spot");
    await p
      .getByRole("button", { name: "Place buy order", exact: true })
      .click();
    const dialog = p.getByRole("dialog", { name: "Insufficient balance" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Review order" }),
    ).toBeFocused();
    const rejected = await snapshot(p, r);
    expect(rejected.lesson!.orders.length).toBe(before.lesson!.orders.length);
    expect(rejected.lesson!.wallet.cash).toBe(before.lesson!.wallet.cash);
    await dialog.getByRole("button", { name: "Review order" }).click();
    await expect(p.getByLabel("Shared margin explanation")).toContainText(
      "moved no cash or assets",
    );
    await p.getByLabel("Quantity").fill("1");
    await p
      .getByRole("button", { name: "Place buy order", exact: true })
      .click();
    await expect(p.locator(".goal-list")).not.toContainText("○");
    await visual(p);
    await p.getByLabel("Shared margin explanation").screenshot({
      path: `test-results/phase4-${colorScheme}-combined-explanation.png`,
    });
    await advance(p, r, 80);
    await p.getByRole("button", { name: "Fast-forward", exact: true }).click();
    await expect(p.getByLabel("Scenario result")).toContainText(
      "Trading requirement met",
    );
    expect(
      (await snapshot(p, r)).lesson!.wallet.holdings.map((h) => h.quantity),
    ).toEqual(["0", "0", "0"]);
  });
test("D/P: lost explicit-close response retries the saved reduce payload/key and realizes once", async ({
  page: p,
  request: r,
  context,
}) => {
  test.setTimeout(90000);
  await login(p);
  await open(p, r, "perp-direction");
  await p.getByLabel("Quantity").fill("1");
  await p.getByRole("button", { name: "Place buy order", exact: true }).click();
  await expect(p.getByLabel("ETC position")).toBeVisible();
  await p.route("**/api/mock/state", (route) => route.abort());
  await p.route("**/api/mock/order-preview", (route) => route.abort());
  const sent: unknown[] = [];
  await p.route("**/api/mock/command", async (route) => {
    sent.push(route.request().postDataJSON());
    if (sent.length === 1) {
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await p
    .getByRole("button", { name: "Close available ETC", exact: true })
    .click();
  await expect(p.locator(".delivery-status")).toContainText(
    "Delivery is unconfirmed",
  );
  await context.setOffline(true);
  await expect(
    p.getByRole("button", { name: "Retry original command", exact: true }),
  ).toBeEnabled();
  await context.setOffline(false);
  await p
    .getByRole("button", { name: "Retry original command", exact: true })
    .click();
  await expect(p.getByLabel("ETC position")).toHaveCount(0);
  expect(sent.length).toBe(2);
  expect(sent[1]).toEqual(sent[0]);
  const s = await snapshot(p, r);
  expect(s.lesson!.orders.filter((o) => o.reduceOnly).length).toBe(1);
  expect(s.lesson!.positions!.length).toBe(0);
});
test("D: known offline blocks cached close and unchanged draft before creating any fresh saved intent", async ({
  page: p,
  request: r,
  context,
}) => {
  test.setTimeout(90000);
  await login(p);
  await open(p, r, "perp-direction");
  await p.getByLabel("Quantity").fill("1");
  await p.getByRole("button", { name: "Place buy order", exact: true }).click();
  await expect(p.getByLabel("ETC position")).toBeVisible();
  await expect(
    p.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
  let fresh = 0;
  p.on("request", (req) => {
    if (req.url().endsWith("/api/mock/command")) fresh++;
  });
  await context.setOffline(true);
  await expect(
    p.getByRole("button", { name: "Close available ETC", exact: true }),
  ).toBeDisabled();
  await expect(
    p.getByRole("button", { name: /Order check unavailable|Checking order/ }),
  ).toBeDisabled();
  await p
    .locator(".order-form")
    .evaluate((form) =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  await expect(p.locator(".delivery-status")).toContainText(
    "No new command was saved or sent",
  );
  expect(fresh).toBe(0);
  expect(
    await p.evaluate(
      () =>
        Object.keys(sessionStorage).filter((k) =>
          k.startsWith("cot.demo.pending."),
        ).length,
    ),
  ).toBe(0);
  await context.setOffline(false);
  await expect(
    p.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
  await expect(
    p.getByRole("button", { name: "Close available ETC", exact: true }),
  ).toBeEnabled();
  await p
    .getByRole("button", { name: "Close available ETC", exact: true })
    .click();
  await expect(p.getByLabel("ETC position")).toHaveCount(0);
  expect(fresh).toBe(1);
});
