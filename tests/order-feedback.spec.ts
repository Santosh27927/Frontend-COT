import { test, expect } from "@playwright/test";
import type { Page, APIRequestContext } from "@playwright/test";
async function login(page: Page) {
  await page.goto("/?device=A");
  await page.getByLabel("Account name").fill("learner");
  await page.getByLabel("Four-digit PIN").fill("0073");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Welcome, learner", { exact: true }),
  ).toBeVisible();
}
async function headers(page: Page) {
  return {
    Authorization: `Bearer ${await page.evaluate(() => sessionStorage.getItem("cot.demo.token.A"))}`,
  };
}
async function state(page: Page, request: APIRequestContext) {
  return (
    await request.get("/api/mock/state", { headers: await headers(page) })
  ).json();
}
async function command(
  page: Page,
  request: APIRequestContext,
  data: Record<string, unknown>,
) {
  const r = await request.post("/api/mock/command", {
    headers: await headers(page),
    data: { intentId: crypto.randomUUID(), ...data },
  });
  expect(r.status()).toBe(200);
  return r.json();
}
async function advance(
  page: Page,
  request: APIRequestContext,
  seconds: number,
) {
  const s = await state(page, request);
  const r = await request.post("/api/mock/dev-advance", {
    headers: await headers(page),
    data: { attemptId: s.lesson.id, seconds },
  });
  expect(r.status()).toBe(200);
}
async function complete(
  page: Page,
  request: APIRequestContext,
  lesson: string,
) {
  for (const suffix of ["etc", "sol", "btc"]) {
    const { state: s } = await command(page, request, {
      action: "start",
      variantId: `${lesson}-${suffix}`,
    });
    const base = {
      action: "order",
      attemptId: s.lesson.id,
      symbol: "ETC",
      side: "buy",
      quantity: "1",
    };
    if (lesson === "market") {
      await command(page, request, base);
      await command(page, request, { ...base, side: "sell" });
    } else if (lesson === "gtc")
      await command(page, request, {
        ...base,
        orderType: "LIMIT",
        timeInForce: "GTC",
        limitPrice: "1.5",
      });
    else
      for (const timeInForce of ["IOC", "FOK"])
        await command(page, request, {
          ...base,
          orderType: "LIMIT",
          timeInForce,
          limitPrice: s.lesson.quotes.find(
            (q: { symbol: string }) => q.symbol === "ETC",
          ).price,
        });
    await advance(page, request, 180);
  }
}
async function open(
  page: Page,
  request: APIRequestContext,
  lesson = "gtc",
  variant = 1,
) {
  await complete(page, request, "market");
  if (lesson === "stop-limit") {
    await complete(page, request, "gtc");
    await complete(page, request, "ioc-fok");
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Learn", exact: true })
    .click();
  await expect(
    page.getByLabel("Spot lesson").locator(`option[value="${lesson}"]`),
  ).not.toContainText("locked");
  await page.getByLabel("Spot lesson").selectOption(lesson);
  await page.locator(".scenario-list button").nth(variant).click();
  await expect(
    page.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
}
test.beforeEach(async ({ request }) => {
  await request.post("/api/mock/dev-reset");
});
for (const colorScheme of ["light", "dark"] as const)
  test(`P/Q: ${colorScheme} one SOL placement shows accepted context, no false red error, current price and cancel after draft edits`, async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ colorScheme });
    await login(page);
    await open(page, request);
    await expect(
      page.getByLabel("Current SOL price", { exact: true }),
    ).toContainText("$97.5");
    await expect(page.getByLabel("Limit price (Demo USD)")).toHaveValue(
      "92.625",
    );
    let sent = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/command") && r.postDataJSON()?.action === "order")
        sent++;
    });
    await page
      .getByRole("button", { name: "Place buy order", exact: true })
      .click();
    const panel = page.getByLabel("Your pending SOL order");
    await expect(panel).toContainText("Order placed — waiting to fill");
    await expect(panel).toContainText("Buy 1 SOL");
    await expect(panel).toContainText("Order limit: $92.625");
    await expect(
      page.getByRole("button", { name: "Order pending", exact: true }),
    ).toBeDisabled();
    await expect(page.locator("#order-limits .field-error")).toHaveCount(0);
    expect(sent).toBe(1);
    const s = await state(page, request);
    expect(s.lesson.orders).toHaveLength(1);
    expect(s.lesson.wallet.reservedCash).toBe("92.625");
    await page.getByRole("button", { name: "Sell", exact: true }).click();
    await page.getByLabel("Quantity").fill("2");
    await page.getByLabel("Limit price (Demo USD)").fill("110");
    await expect(panel).toContainText("Buy 1 SOL");
    await expect(panel).toContainText("Order limit: $92.625");
    await expect(page.locator("#order-limits .field-error")).toContainText(
      "Not enough owned asset",
    );
    await panel.screenshot({
      path: `test-results/order-feedback-${colorScheme}-accepted.png`,
    });
    await page
      .getByRole("button", { name: "Cancel pending SOL order", exact: true })
      .click();
    await expect(panel).toHaveCount(0);
    const canceled = await state(page, request);
    expect(canceled.lesson.orders).toHaveLength(1);
    expect(canceled.lesson.orders[0].id).toBe(s.lesson.orders[0].id);
    expect(canceled.lesson.orders[0].status).toBe("CANCELED");
    await page.getByRole("button", { name: "Buy", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Place buy order", exact: true }),
    ).toBeEnabled();
  });
test("P/Q: other asset and immediate IOC remain usable while SOL waits; fill removes restriction", async ({
  page,
  request,
}) => {
  await login(page);
  await open(page, request);
  await page
    .getByRole("button", { name: "Place buy order", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Order pending", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Asset", { exact: true }).selectOption("BTC");
  await expect(page.getByLabel("Your pending SOL order")).toHaveCount(0);
  await expect(
    page.getByLabel("Current BTC price", { exact: true }),
  ).toContainText("$57173.4198");
  await expect(
    page.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Asset", { exact: true }).selectOption("SOL");
  await page.getByLabel("Order policy").selectOption("LIMIT:IOC");
  await page.getByLabel("Limit price (Demo USD)").fill("1");
  await expect(
    page.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Place buy order", exact: true })
    .click();
  await expect(page.locator(".fill-history")).toContainText("CANCELED");
  let s = await state(page, request);
  expect(s.lesson.orders).toHaveLength(2);
  expect(s.lesson.orders[0].status).toBe("PENDING");
  expect(s.lesson.wallet.reservedCash).toBe("92.625");
  await page.getByLabel("Order policy").selectOption("LIMIT:GTC");
  await expect(
    page.getByRole("button", { name: "Order pending", exact: true }),
  ).toBeDisabled();
  await advance(page, request, 60);
  await expect(page.getByLabel("Your pending SOL order")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
  expect((await state(page, request)).lesson.orders[0].status).toBe("FILLED");
});
test("Q/P: current BTC quote updates without resetting edited limit; stop activation stays accepted context", async ({
  page,
  request,
}) => {
  await login(page);
  await open(page, request, "gtc", 2);
  await expect(
    page.getByLabel("Current BTC price", { exact: true }),
  ).toContainText("$57173.4198");
  await expect(page.getByLabel("Limit price (Demo USD)")).toHaveValue(
    "54314.7488",
  );
  await page.getByLabel("Limit price (Demo USD)").fill("1875");
  await advance(page, request, 30);
  await expect(
    page.getByLabel("Current BTC price", { exact: true }),
  ).toContainText("$60032.0907");
  await expect(page.getByLabel("Limit price (Demo USD)")).toHaveValue("1875");
  for (const width of [320, 390, 736]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .locator(".current-price")
    .screenshot({ path: "test-results/order-feedback-current-price.png" });
  await advance(page, request, 180);
  await complete(page, request, "gtc");
  await complete(page, request, "ioc-fok");
  await command(page, request, {
    action: "start",
    variantId: "stop-limit-btc",
  });
  await expect(page.getByLabel("Spot lesson")).toHaveValue("stop-limit");
  await expect(
    page.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Place buy order", exact: true })
    .click();
  const panel = page.getByLabel("Your pending BTC order");
  await expect(panel).toContainText("Order placed — waiting to fill");
  await expect(page.locator("#order-limits .field-error")).toHaveCount(0);
  await advance(page, request, 30);
  await expect(panel).toContainText(
    "Stop activated — limit order waiting to fill",
  );
  await expect(page.locator("#order-limits .field-error")).toHaveCount(0);
  await advance(page, request, 30);
  await expect(panel).toHaveCount(0);
});

test("F/P: failed initial advisory check can retry without changing draft, quote or revision", async ({
  page,
  request,
}) => {
  await page.route("**/api/mock/order-preview", (r) => r.abort());
  await login(page);
  await page
    .getByRole("button", { name: "Start learning", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Order check unavailable", exact: true }),
  ).toBeDisabled();
  const before = await state(page, request);
  await expect(page.getByLabel("Quantity")).toHaveValue("5");
  await expect(
    page.getByLabel("Current ETC price", { exact: true }),
  ).toContainText("$5.6845");
  let sent = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/command") && r.postDataJSON()?.action === "order")
      sent++;
  });
  await page.unroute("**/api/mock/order-preview");
  await page
    .getByRole("button", { name: "Retry order check", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
  const after = await state(page, request);
  expect(after.revision).toBe(before.revision);
  expect(after.lesson.quotes[0].price).toBe(before.lesson.quotes[0].price);
  await expect(page.getByLabel("Quantity")).toHaveValue("5");
  expect(sent).toBe(0);
  await page
    .getByRole("button", { name: "Place buy order", exact: true })
    .click();
  await expect(page.locator(".fill-history")).toContainText("FILLED");
  expect(sent).toBe(1);
});
test("F/P: restoring browser connectivity refreshes an unavailable check for the unchanged edited draft", async ({
  page,
  context,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "Start learning", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
  await context.setOffline(true);
  await page.getByLabel("Quantity").fill("2");
  await expect(
    page.getByRole("button", { name: "Order check unavailable", exact: true }),
  ).toBeDisabled();
  await context.setOffline(false);
  await expect(
    page.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Quantity")).toHaveValue("2");
  await expect(
    page.getByLabel("Current ETC price", { exact: true }),
  ).toContainText("$5.6845");
  await expect(
    page.getByRole("button", { name: "Retry order check", exact: true }),
  ).toHaveCount(0);
});

test("F/P: same-draft refresh invalidates a known successful preview while held and after failure", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "Start learning", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("#order-limits")).toContainText("175.916967 ETC");
  let captured!: () => void, release!: () => void;
  const ready = new Promise<void>((r) => (captured = r)),
    hold = new Promise<void>((r) => (release = r));
  await page.route("**/api/mock/order-preview", async (route) => {
    captured();
    await hold;
    await route.abort();
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await ready;
  await expect(
    page.getByRole("button", { name: "Checking order…", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("#order-limits")).not.toContainText(
    "175.916967 ETC",
  );
  release();
  await expect(
    page.getByRole("button", { name: "Order check unavailable", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/mock/order-preview");
  await page
    .getByRole("button", { name: "Retry order check", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Quantity")).toHaveValue("5");
  await expect(page.locator("#order-limits")).toContainText("175.916967 ETC");
});
