import { test, expect } from "@playwright/test";
import type { Page, APIRequestContext } from "@playwright/test";
async function login(page: Page, device = "A") {
  await page.goto("/?device=" + device);
  await page.getByLabel("Account name").fill("learner");
  await page.getByLabel("Four-digit PIN").fill("0073");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Welcome, learner", { exact: true }),
  ).toBeVisible();
}
const nav = (p: Page, n: string) =>
  p.getByRole("navigation").getByRole("button", { name: n, exact: true });
async function headers(p: Page) {
  return {
    Authorization: `Bearer ${await p.evaluate(() => sessionStorage.getItem("cot.demo.token.A"))}`,
  };
}
async function snapshot(p: Page, r: APIRequestContext) {
  return (await r.get("/api/mock/state", { headers: await headers(p) })).json();
}
async function command(
  p: Page,
  r: APIRequestContext,
  body: Record<string, unknown>,
) {
  const response = await r.post("/api/mock/command", {
    headers: await headers(p),
    data: { intentId: crypto.randomUUID(), ...body },
  });
  expect(response.status()).toBe(200);
  return response.json();
}
async function advance(p: Page, r: APIRequestContext, seconds: number) {
  const s = await snapshot(p, r);
  const response = await r.post("/api/mock/dev-advance", {
    headers: await headers(p),
    data: { attemptId: s.lesson.id, seconds },
  });
  expect(response.status()).toBe(200);
  return response.json();
}
async function unlockMarket(p: Page, r: APIRequestContext) {
  for (const variantId of ["market-etc", "market-sol", "market-btc"]) {
    const { state } = await command(p, r, { action: "start", variantId });
    for (const side of ["buy", "sell"])
      await command(p, r, {
        action: "order",
        attemptId: state.lesson.id,
        symbol: "ETC",
        side,
        quantity: "1",
      });
    await advance(p, r, 180);
  }
  await expect
    .poll(async () => (await snapshot(p, r)).course.gtcAvailable)
    .toBe(true);
}
async function openGtc(p: Page, r: APIRequestContext) {
  await unlockMarket(p, r);
  await nav(p, "Learn").click();
  await expect(
    p.getByLabel("Spot lesson").locator("option[value=gtc]"),
  ).toHaveText("GTC limit orders · 0/3");
  await p.getByLabel("Spot lesson").selectOption("gtc");
  await p.locator(".scenario-list button").first().click();
  await expect(p.getByLabel("Limit price (Demo USD)")).toBeVisible();
}
async function begin(p: Page) {
  await p.getByRole("button", { name: "Start learning" }).click();
  await expect(p.getByLabel("Quantity")).toBeVisible();
  await expect(
    p.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
}
async function contrast(page: Page) {
  const issues = await page.evaluate(() => {
    const rgb = (s: string) => {
      const v = s.match(/[\d.]+/g)?.map(Number) ?? [];
      return v.length >= 3 ? [v[0], v[1], v[2], v[3] ?? 1] : [0, 0, 0, 0];
    };
    const lum = (v: number[]) =>
      v
        .slice(0, 3)
        .map((x) => {
          const c = x / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const roots = [
      document.querySelector("dialog[open]") ||
        document.querySelector(".app-frame")!,
    ];
    const failures: string[] = [];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.trim()) continue;
        const el = node.parentElement!;
        if (
          !el.getClientRects().length ||
          getComputedStyle(el).visibility === "hidden"
        )
          continue;
        if (el.closest("[hidden],option,svg")) continue;
        const fg = rgb(getComputedStyle(el).color);
        let bg = [255, 255, 255, 1];
        const chain: Element[] = [];
        for (let n: Element | null = el; n; n = n.parentElement)
          chain.unshift(n);
        for (const n of chain) {
          const c = rgb(getComputedStyle(n).backgroundColor);
          bg = [0, 1, 2].map((i) => c[i] * c[3] + bg[i] * (1 - c[3])).concat(1);
        }
        const a = lum(fg),
          b = lum(bg),
          ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < 4.5)
          failures.push(
            `${node.textContent.trim().slice(0, 45)}: ${ratio.toFixed(2)}`,
          );
      }
    }
    return failures;
  });
  expect(issues).toEqual([]);
}
test.beforeEach(async ({ request }) => {
  await request.post("/api/mock/dev-reset");
});
for (const colorScheme of ["light", "dark"] as const)
  test(`C/Q: ${colorScheme} panels, popup, replay and mobile controls remain readable`, async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ colorScheme });
    await login(page);
    await contrast(page);
    await begin(page);
    await expect(page.locator("#order-limits")).toContainText("175.916967 ETC");
    await contrast(page);
    await page.getByLabel("Quantity").fill("600");
    await page.getByRole("button", { name: "Place buy order" }).click();
    const dialog = page.getByRole("dialog", { name: "Insufficient balance" });
    await expect(dialog).toContainText("1000.00");
    await expect(dialog).toContainText("175.916967 ETC");
    await expect(
      dialog.getByRole("button", { name: "Review order" }),
    ).toBeFocused();
    await contrast(page);
    await dialog.screenshot({
      path: `test-results/phase3-${colorScheme}-funds-dialog.png`,
    });
    await page.screenshot({
      path: `test-results/phase3-${colorScheme}-funds.png`,
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Review order" }).click();
    await page.getByLabel("Asset", { exact: true }).selectOption("SOL");
    await expect(page.locator("#order-limits")).toContainText("10 SOL");
    await page.getByLabel("Quantity").fill("1");
    await page.getByRole("button", { name: "Place buy order" }).click();
    await expect(page.locator(".fill-history")).toContainText("FILLED");
    await contrast(page);
    await advance(page, request, 180);
    await expect(page.getByLabel("Scenario result")).toBeVisible();
    await contrast(page);
    await page
      .getByRole("button", { name: "View replay", exact: true })
      .click();
    await expect(page.getByLabel("Scenario replay")).toContainText(
      "Read-only history",
    );
    await expect(page.getByLabel("Replay asset")).toHaveValue("SOL");
    await contrast(page);
    await page.getByLabel("Scenario result").screenshot({
      path: `test-results/phase3-${colorScheme}-result-card.png`,
    });
    await page
      .getByLabel("Scenario replay")
      .getByRole("heading", { name: "Scenario replay", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/phase3-${colorScheme}-replay-screen.png`,
    });
    for (const width of [320, 390, 736]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const overlaps = await page.locator(".app-frame").evaluate((root) => {
        const r = [...root.querySelectorAll("button,input,select")]
          .filter((n) => !n.closest("details:not([open])"))
          .map((n) => n.getBoundingClientRect())
          .filter((r) => r.width && r.height);
        return r.some(
          (a, i) =>
            a.height < 44 ||
            r
              .slice(i + 1)
              .some(
                (b) =>
                  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1,
              ),
        );
      });
      expect(overlaps).toBe(false);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `test-results/phase3-${colorScheme}-result.png`,
      fullPage: true,
    });
  });
test("O/Q: GTC shows reservation/max before order, cancellation and guided pending to fill", async ({
  page,
  request,
}) => {
  await login(page);
  await openGtc(page, request);
  await page.getByLabel("Quantity").fill("5");
  await page.getByLabel("Limit price (Demo USD)").fill("1.9");
  await page.getByRole("button", { name: "Place buy order" }).click();
  await expect(page.locator(".fill-history")).toContainText("PENDING");
  await expect(page.locator("#order-limits")).toContainText("990.50");
  await expect(page.locator("#order-limits")).toContainText("9.50");
  await page.getByRole("button", { name: "Cancel ETC order" }).click();
  await expect(page.locator(".fill-history")).toContainText("CANCELED");
  await expect(page.locator("#order-limits")).toContainText("1000.00");
  await page.getByRole("button", { name: "Place buy order" }).click();
  await advance(page, request, 30);
  await expect(page.locator(".fill-history")).toContainText("PENDING");
  await page.screenshot({
    path: "test-results/phase3-gtc-pending.png",
    fullPage: true,
  });
  await advance(page, request, 30);
  await expect(page.locator(".fill-history")).toContainText("FILLED");
  await expect(page.locator(".goal-list")).toContainText("✓");
  await expect(
    page.getByRole("button", { name: "Fast-forward", exact: true }),
  ).toHaveCount(0);
  await advance(page, request, 20);
  await page.getByRole("button", { name: "Fast-forward", exact: true }).click();
  await expect(page.getByLabel("Scenario result")).toContainText(
    "Trading requirement met",
  );
});
test("L/I/S/G: complete the spot course in UI, observe both policies/stop states, collect ETC once", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await login(page);
  await openGtc(page, request);
  for (const lesson of ["gtc", "ioc-fok", "stop-limit"])
    for (let i = 0; i < 3; i++) {
      await expect(page.getByLabel("Spot lesson")).toHaveValue(lesson);
      await expect(page.locator(".observation strong")).toHaveText(
        lesson === "gtc"
          ? "See a GTC limit order wait, then fill"
          : lesson === "ioc-fok"
            ? "Fill a limit IOC order immediately; Fill a limit FOK order immediately"
            : "See a dormant stop trigger, then its limit order fill",
      );
      await page.getByRole("button", { name: "Place buy order" }).click();
      await expect(page.locator(".fill-history")).toBeVisible();
      if (lesson === "ioc-fok") {
        await expect(page.locator(".goal-list")).toContainText(
          "✓ Fill a limit IOC",
        );
        await page.getByLabel("Order policy").selectOption("LIMIT:FOK");
        await page.getByRole("button", { name: "Place buy order" }).click();
        await expect(page.locator(".goal-list")).toContainText(
          "✓ Fill a limit FOK",
        );
      }
      if (lesson === "stop-limit") {
        await advance(page, request, 30);
        await expect(page.locator(".fill-history")).toContainText("TRIGGERED");
        await expect(page.locator(".goal-list")).toContainText("○");
        await page.screenshot({
          path: "test-results/phase3-stop-trigger.png",
          fullPage: true,
        });
        await advance(page, request, 30);
        await expect(page.locator(".fill-history")).toContainText("FILLED");
      }
      await advance(page, request, 180);
      await expect(page.getByLabel("Scenario result")).toContainText(
        "Trading requirement met",
      );
      if (!(lesson === "stop-limit" && i === 2))
        await page
          .getByRole("button", { name: "Next scenario", exact: true })
          .click();
    }
  await expect(
    page.getByText("Spot course complete", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Perpetuals", exact: true }),
  ).toBeEnabled();
  expect((await snapshot(page, request)).course.totalCompletedScenarios).toBe(
    12,
  );
  await nav(page, "Village").click();
  await expect(page.getByLabel("SOL generator")).toHaveCount(0);
  await expect(page.getByLabel("BTC generator")).toContainText(
    "0.0001 BTC/hour",
  );
  await expect(
    page.getByRole("button", { name: "Collect ETC", exact: true }),
  ).toBeVisible();
  await page.locator(".developer-tools summary").click();
  await page
    .getByRole("button", { name: "Advance resources 60h", exact: true })
    .click();
  await expect(page.getByLabel("ETC generator")).toContainText("Stored: 50");
  await page.getByRole("button", { name: "Collect ETC", exact: true }).click();
  await expect(page.getByLabel("ETC generator")).not.toContainText(
    "Stored: 50",
  );
  await expect(
    page.getByRole("button", { name: "Collect ETC", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/phase3-village.png",
    fullPage: true,
  });
  expect((await snapshot(page, request)).holdings[0].quantity).toBe("50");
});
test("Q/D: old asset/quantity preview cannot replace a newer response", async ({
  page,
}) => {
  await login(page);
  await begin(page);
  await expect(page.locator("#order-limits")).toContainText("175.916967 ETC");
  let release!: () => void,
    captured!: () => void,
    held = false;
  const hold = new Promise<void>((r) => (release = r)),
    ready = new Promise<void>((r) => (captured = r));
  await page.route("**/api/mock/order-preview", async (route) => {
    const data = route.request().postDataJSON();
    const response = await route.fetch();
    if (!held && data.symbol === "ETC" && data.quantity === "2") {
      held = true;
      captured();
      await hold;
      await route.fulfill({
        response,
        headers: { ...response.headers(), "x-old-preview": "yes" },
      });
    } else await route.fulfill({ response });
  });
  await page.getByLabel("Quantity").fill("2");
  await ready;
  await page.getByLabel("Asset", { exact: true }).selectOption("SOL");
  await page.getByLabel("Quantity").fill("999");
  await expect(page.locator("#order-limits")).toContainText("10 SOL");
  await expect(page.locator("#order-limits")).toContainText(
    "Not enough Demo USD",
  );
  const old = page.waitForResponse(
    (r) => r.headers()["x-old-preview"] === "yes",
  );
  release();
  await old;
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
  await expect(page.locator("#order-limits")).toContainText("10 SOL");
  await expect(page.locator("#order-limits")).toContainText(
    "Not enough Demo USD",
  );
  await expect(page.locator("#order-limits")).not.toContainText(
    "175.916967 ETC",
  );
});
test("D/G: lost collection response retries the saved command without a second credit", async ({
  page,
  request,
}) => {
  await login(page);
  await unlockMarket(page, request);
  await request.post("/api/mock/dev-resources", {
    headers: await headers(page),
    data: { hours: 60 },
  });
  await expect(page.getByLabel("ETC generator")).toContainText("Stored: 50");
  await page.route("**/api/mock/state", (r) => r.abort());
  let original: unknown;
  await page.route("**/api/mock/command", async (r) => {
    original = r.request().postDataJSON();
    await r.fetch();
    await r.abort();
  });
  await page.getByRole("button", { name: "Collect ETC", exact: true }).click();
  await expect(page.locator(".delivery-status")).toContainText(
    "Delivery is unconfirmed",
  );
  await expect(
    page.getByRole("button", { name: "Collect ETC", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.unroute("**/api/mock/state");
  await page.unroute("**/api/mock/command"); // Reload recovers confirmation from state, rather than sending a second claim.
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry original command" }),
  ).toHaveCount(0);
  expect((await snapshot(page, request)).holdings[0].quantity).toBe("50");
  expect(original).toBeTruthy();
});
test("D: preview first discovering replacement clears old auth even when state is unavailable", async ({
  page,
  context,
}) => {
  await login(page);
  await begin(page);
  await expect(page.locator("#order-limits")).toContainText("175.916967 ETC");
  await page.route("**/api/mock/state", (r) => r.abort());
  await page.route("**/api/mock/order-preview", (r) => r.abort());
  const b = await context.newPage();
  await login(b, "B");
  await page.unroute("**/api/mock/order-preview");
  await page.getByLabel("Quantity").fill("2");
  await expect(
    page.getByRole("dialog", { name: "Signed in on another device" }),
  ).toBeVisible();
  await expect(nav(page, "Village")).toHaveCount(0);
  await expect(nav(b, "Village")).toBeVisible();
});
