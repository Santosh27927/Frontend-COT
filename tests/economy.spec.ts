import { test, expect } from "@playwright/test";
import type { Page, APIRequestContext } from "@playwright/test";
import type { PlayerState } from "../src/api/types";
async function login(p: Page) {
  await p.goto("/?device=A");
  await p.getByLabel("Account name").fill("learner");
  await p.getByLabel("Four-digit PIN").fill("0073");
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    p.getByRole("navigation", { name: "Player navigation" }),
  ).toBeVisible();
}
const nav = (p: Page, name: string) =>
  p
    .getByRole("navigation", { name: "Player navigation" })
    .getByRole("button", { name, exact: true });
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
  body: Record<string, unknown>,
) {
  const res = await r.post("/api/mock/command", {
    headers: await headers(p),
    data: { intentId: crypto.randomUUID(), ...body },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).state as PlayerState;
}
async function advance(p: Page, r: APIRequestContext, seconds = 180) {
  const s = await snapshot(p, r);
  const res = await r.post("/api/mock/dev-advance", {
    headers: await headers(p),
    data: { attemptId: s.lesson!.id, seconds },
  });
  expect(res.status()).toBe(200);
}
async function completeSpot(p: Page, r: APIRequestContext, all = true) {
  for (const lesson of ["market", "gtc", "ioc-fok", "stop-limit"]) {
    if (!all && lesson !== "market") break;
    for (const suffix of ["etc", "sol", "btc"]) {
      const s = await command(p, r, {
          action: "start",
          variantId: `${lesson}-${suffix}`,
        }),
        a = s.lesson!,
        symbol = a.recommendedAsset,
        quantity = a.defaultQuantity;
      const order = (extra: Record<string, unknown>) =>
        command(p, r, {
          action: "order",
          attemptId: a.id,
          symbol,
          side: "buy",
          quantity,
          ...extra,
        });
      if (lesson === "market") {
        await order({ symbol: "ETC", quantity: "1" });
        await order({ symbol: "ETC", quantity: "1", side: "sell" });
      } else if (lesson === "ioc-fok") {
        for (const timeInForce of ["IOC", "FOK"])
          await order({
            orderType: "LIMIT",
            timeInForce,
            limitPrice: a.quotes.find((q) => q.symbol === symbol)!.price,
          });
      } else {
        const d = a.form.defaults.find(
          (d) => d.symbol === symbol && d.side === "buy",
        )!;
        await order({
          orderType: lesson === "gtc" ? "LIMIT" : "STOP_LIMIT",
          timeInForce: "GTC",
          limitPrice: d.limitPrice,
          ...(lesson === "stop-limit" ? { stopPrice: d.stopPrice } : {}),
        });
      }
      await advance(p, r);
    }
  }
  await expect
    .poll(async () => (await snapshot(p, r)).course.totalCompletedScenarios)
    .toBe(all ? 12 : 3);
  await expect(
    p.getByRole("button", { name: "Review conversion", exact: true }),
  )[all ? "toBeEnabled" : "toBeDisabled"]();
}
const usd = (v: string) => {
  const [w, f = ""] = v.split(".");
  return BigInt(w) * 1000000000000n + BigInt(f.padEnd(12, "0"));
};
test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/mock/dev-reset")).status()).toBe(200);
});

test("V01: landscape-first village, portrait fallback, fixed wallet metadata and locked features remain readable", async ({
  page,
}) => {
  await login(page);
  for (const [width, height] of [
    [844, 390],
    [390, 844],
    [320, 700],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole("button", { name: "Town Hall Level 1", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await expect(
    page.getByRole("button", {
      name: "ETC collector Earn through lessons",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "BTC collector Earn through lessons",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("SOL generator")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review conversion", exact: true }),
  ).toBeDisabled();
  await nav(page, "Portfolio").click();
  const table = page.locator(".storage-table");
  await expect(table).toContainText("2000");
  await expect(table).toContainText("350");
  await expect(table).toContainText("20");
  await expect(table.getByRole("row").filter({ hasText: "BTC" })).toContainText(
    "Unlimited",
  );
  await expect(
    page.getByText("No pending credits.", { exact: true }),
  ).toBeVisible();
  await nav(page, "Village").click();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(
      page.getByRole("heading", { name: "Your village", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/economy-village-${colorScheme}-landscape.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/economy-village-portrait.png",
    fullPage: true,
  });
});

test("V02: completing12spot scenarios unlocks fixed-value converter; quote review precedes debit and cooldown", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await login(page);
  await completeSpot(page, request);
  const before = await snapshot(page, request);
  await expect(
    page.getByText(
      "Converter unlocked by completing all twelve spot scenarios.",
      { exact: true },
    ),
  ).toBeVisible();
  const converter = page.locator(".converter-panel");
  await expect(converter.locator("input")).toHaveCount(0);
  await page.locator("#converter-destination").selectOption("BTC");
  await page
    .getByRole("button", { name: "Review conversion", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Your conversion quote" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Source: 50.00 USD");
  await expect(dialog).toContainText("Total entitlement:");
  await expect(dialog).toContainText("Wallet credit:");
  await expect(dialog).toContainText("Pending fraction:");
  await expect(dialog).toContainText("Source available:");
  await expect(dialog).toContainText(
    "Destination free: Unlimited gameplay storage",
  );
  await expect(dialog).toContainText("Exact source change:");
  await expect(dialog).toContainText("Simulated prices at");
  await expect(dialog).toContainText("USD = $1.00; BTC = $");
  await expect(dialog).toContainText("Zero fees");
  await expect(dialog).toContainText("fluctuate");
  expect((await snapshot(page, request)).demoUsd).toBe(before.demoUsd);
  await page.screenshot({
    path: "test-results/economy-conversion-review.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", {
      name: "Accept the quoted conversion and volatility risk",
      exact: true,
    })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".delivery-status")).toContainText(
    "Conversion completed",
  );
  const after = await snapshot(page, request);
  expect(usd(before.demoUsd) - usd(after.demoUsd)).toBeGreaterThan(
    49n * 1000000000000n,
  );
  expect(usd(before.demoUsd) - usd(after.demoUsd)).toBeLessThanOrEqual(
    50n * 1000000000000n,
  );
  expect(after.holdings.find((h) => h.asset === "BTC")!.quantity).not.toBe("0");
  await expect(
    page.getByRole("button", { name: "Review conversion", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".converter-panel")).toContainText(
    "Next conversion",
  );
  await expect(page.locator(".converter-panel time").first()).toHaveAttribute(
    "datetime",
    after.economy.converter.nextAt!,
  );
});

test("V03: construction review, acknowledgement and refund are visible; new timer survives browser reload", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await login(page);
  await completeSpot(page, request);
  const before = await snapshot(page, request);
  await page
    .getByRole("button", { name: "Town Hall Level 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review upgrade cost", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Your upgrade quote" });
  await expect(dialog).toContainText("Pay 100.00 USD");
  await expect(dialog).toContainText("12 hours");
  await dialog
    .getByRole("button", { name: "Pay and start construction", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Upgrading to level 2" }),
  ).toBeVisible();
  expect(usd((await snapshot(page, request)).demoUsd)).toBe(
    usd(before.demoUsd) - 100n * 1000000000000n,
  );
  await page
    .getByRole("button", { name: "Review cancellation", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Cancel construction?" });
  await expect(dialog).toContainText("Refund: 50.00 USD");
  const confirm = dialog.getByRole("button", {
    name: "Confirm cancellation",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await dialog
    .getByRole("checkbox", {
      name: "I acknowledge the cancellation loss",
      exact: true,
    })
    .check();
  await expect(confirm).toBeEnabled();
  await page.screenshot({
    path: "test-results/economy-cancellation-ack.png",
    fullPage: true,
  });
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  expect(usd((await snapshot(page, request)).demoUsd)).toBe(
    usd(before.demoUsd) - 50n * 1000000000000n,
  );
  await page
    .getByRole("button", { name: "Review upgrade cost", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Your upgrade quote" })
    .getByRole("button", { name: "Pay and start construction", exact: true })
    .click();
  const accepted = await snapshot(page, request);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Upgrading to level 2" }),
  ).toBeVisible();
  expect((await snapshot(page, request)).economy.constructions[0].id).toBe(
    accepted.economy.constructions[0].id,
  );
  const world = await request.post("/api/mock/dev-world", {
    headers: await headers(page),
    data: { hours: 12 },
  });
  expect(world.status()).toBe(200);
  await expect(
    page.getByRole("button", { name: "Town Hall Level 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review cancellation", exact: true }),
  ).toHaveCount(0);
});

test("V04: wrong quiz retries are free; correct answer and explanation are separate blocks, later reward is2.5 once", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  await login(page);
  await completeSpot(page, request, false);
  const before = await snapshot(page, request);
  await page
    .getByRole("button", { name: "01 market Available", exact: true })
    .click();
  await page
    .getByRole("radio", { name: /B\. Your ETC quantity increases/ })
    .check();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.locator(".answer-feedback")).toContainText(
    "Review and try again",
  );
  await expect(page.locator(".correct-answer")).toHaveText("Correct answer: A");
  await expect(page.locator(".answer-explanation h4")).toHaveText(
    "Explanation",
  );
  await expect(page.locator(".answer-explanation p")).toHaveText(
    "Price changes valuation; it does not create asset units or automatically realize a sale.",
  );
  expect((await snapshot(page, request)).demoUsd).toBe(before.demoUsd);
  await page.getByRole("radio", { name: /A\. Your2 ETC stay/ }).check();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.locator(".answer-feedback")).toContainText(
    "Reward: 2.5 Demo USD",
  );
  expect(usd((await snapshot(page, request)).demoUsd)).toBe(
    usd(before.demoUsd) + 2500000000000n,
  );
  await expect(
    page.getByRole("button", { name: "Check answer", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/economy-question-feedback.png",
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole("button", { name: "01 market Completed", exact: true })
    .click();
  await expect(page.locator(".answer-feedback")).toContainText(
    "Reward: 2.5 Demo USD",
  );
  expect(usd((await snapshot(page, request)).demoUsd)).toBe(
    usd(before.demoUsd) + 2500000000000n,
  );
});

test("V05: pending profit is claimable only with space; manual controls stay blocked during active practice", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  await login(page);
  await completeSpot(page, request, false);
  let s = await command(page, request, {
    action: "start",
    variantId: "gtc-etc",
  });
  const attemptId = s.lesson!.id;
  await command(page, request, {
    action: "order",
    attemptId,
    symbol: "ETC",
    side: "buy",
    quantity: "5",
  });
  await command(page, request, {
    action: "order",
    attemptId,
    symbol: "ETC",
    side: "sell",
    quantity: "1",
    orderType: "LIMIT",
    timeInForce: "GTC",
    limitPrice: "10000",
  });
  await advance(page, request);
  s = await snapshot(page, request);
  expect(s.demoUsd).toBe("2000.00");
  expect(
    s.economy.credits.find((c) => c.asset === "USD")!.origins,
  ).toBeGreaterThan(0);
  await nav(page, "Portfolio").click();
  await expect(page.locator(".credit-row")).toContainText("USD pending");
  await expect(
    page.getByRole("button", { name: "Claim USD", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/economy-pending-profits.png",
    fullPage: true,
  });
  await command(page, request, { action: "start", variantId: "market-etc" });
  await nav(page, "Village").click();
  await expect
    .poll(async () => (await snapshot(page, request)).lesson!.practice)
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Collect ETC", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".question-list button").first()).toBeDisabled();
});

test("V06: earned collector labels fit their clickable buttons at320/390 and collection credits each asset", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await login(page);
  await completeSpot(page, request);
  const units = (value: string) => {
    const [w, f = ""] = value.split(".");
    return BigInt(w) * 100000000n + BigInt(f.padEnd(8, "0"));
  };
  for (const [width, colorScheme] of [
    [320, "light"],
    [390, "dark"],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme });
    const advanced = await request.post("/api/mock/dev-resources", {
      headers: await headers(page),
      data: { hours: 1 },
    });
    expect(advanced.status()).toBe(200);
    for (const asset of ["ETC", "BTC"] as const) {
      const button = page.getByRole("button", {
        name: `Collect ${asset}`,
        exact: true,
      });
      await expect(button).toBeEnabled();
      await button.scrollIntoViewIfNeeded();
      const bounds = await button.evaluate((element) => {
        const button = element as HTMLButtonElement,
          box = button.getBoundingClientRect(),
          range = document.createRange();
        range.selectNodeContents(button);
        const text = range.getBoundingClientRect();
        return {
          contentFits: button.scrollWidth <= button.clientWidth,
          textFits:
            text.left >= box.left &&
            text.right <= box.right &&
            text.top >= box.top &&
            text.bottom <= box.bottom,
          buttonWidth: box.width,
          textWidth: text.width,
        };
      });
      expect(
        bounds.contentFits,
        `${asset} label must not overflow its button at${width}px: ${JSON.stringify(bounds)}`,
      ).toBe(true);
      expect(
        bounds.textFits,
        `${asset} text must stay inside the visible clickable area at${width}px: ${JSON.stringify(bounds)}`,
      ).toBe(true);
      const before = await snapshot(page, request),
        owned = units(before.holdings.find((h) => h.asset === asset)!.quantity);
      await button.click();
      await expect(page.locator(".delivery-status")).toContainText(`Collected`);
      await expect
        .poll(async () =>
          units(
            (await snapshot(page, request)).holdings.find(
              (h) => h.asset === asset,
            )!.quantity,
          ),
        )
        .toBeGreaterThan(owned);
    }
    await page
      .getByLabel("ETC generator", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/economy-earned-collectors-${width}-${colorScheme}.png`,
      fullPage: true,
    });
  }
});
