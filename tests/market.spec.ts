import { test, expect } from "@playwright/test";
import type { Page, APIRequestContext } from "@playwright/test";
async function login(page: Page, account = "learner", device = "A") {
  await page.goto(`/?device=${device}`);
  await page.getByLabel("Account name").fill(account);
  await page
    .getByLabel("Four-digit PIN")
    .fill(account === "trader" ? "0042" : "0073");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText(`Welcome, ${account}`, { exact: true }),
  ).toBeVisible();
}
const nav = (p: Page, name: string) =>
  p.getByRole("navigation").getByRole("button", { name, exact: true });
async function auth(page: Page) {
  const token = await page.evaluate(() =>
    sessionStorage.getItem("cot.demo.token.A"),
  );
  return { Authorization: `Bearer ${token}` };
}
async function state(page: Page, request: APIRequestContext) {
  return (
    await request.get("/api/mock/state", { headers: await auth(page) })
  ).json();
}
async function advance(
  page: Page,
  request: APIRequestContext,
  seconds: number,
) {
  const s = await state(page, request);
  const r = await request.post("/api/mock/dev-advance", {
    headers: await auth(page),
    data: { attemptId: s.lesson.id, seconds },
  });
  expect(r.status()).toBe(200);
  return r.json();
}
async function begin(page: Page) {
  await page.getByRole("button", { name: "Start learning" }).click();
  await expect(page.getByLabel("Quantity")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
}
test.beforeEach(async ({ request }) => {
  await request.post("/api/mock/dev-reset");
});
test("T2/T3/T7: immediate fill, changing chart,80-second gate, results and read-only replay", async ({
  page,
  request,
}) => {
  await login(page);
  await begin(page);
  await expect(
    page.getByRole("button", { name: "Fast-forward", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Quantity").fill("9999");
  await page.getByRole("button", { name: "Place buy order" }).click();
  await expect(page.locator(".delivery-status")).toContainText(
    "Not enough Demo USD",
  );
  await page.getByRole("button", { name: "Review order", exact: true }).click();
  await expect(page.locator(".fill-history")).toHaveCount(0);
  await page.getByLabel("Quantity").fill("5");
  await page.getByRole("button", { name: "Place buy order" }).click();
  await expect(page.locator(".fill-history")).toContainText(
    "Bought 5 ETC at $5.6845",
  );
  await expect(page.locator(".wallet strong")).toHaveText("971.5775");
  await advance(page, request, 60);
  await expect(page.locator(".observation")).toContainText("Take 20 seconds");
  await expect(
    page.getByRole("button", { name: "Fast-forward", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".price-chart figcaption strong")).toHaveText(
    "$5.542387",
  );
  await page.screenshot({
    path: "test-results/market-observation.png",
    fullPage: true,
  });
  await advance(page, request, 20);
  await page.getByRole("button", { name: "Fast-forward", exact: true }).click();
  await expect(page.getByLabel("Scenario result")).toContainText(
    "Trading requirement met",
  );
  await expect(
    page.getByText("Three guided scenarios · 1/3 completed"),
  ).toBeVisible();
  await expect(page.locator(".wallet strong")).toHaveText("1000.71056");
  await page.getByRole("button", { name: "View replay", exact: true }).click();
  await expect(page.getByLabel("Scenario replay")).toContainText(
    "Closed 5 lesson-purchased ETC",
  );
  await expect(page.getByLabel("Scenario replay")).toContainText(
    "Read-only history",
  );
  await page.screenshot({
    path: "test-results/market-result-replay.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close replay" }).click();
  await page
    .getByRole("button", { name: "Practice again", exact: true })
    .click();
  await expect(page.locator(".practice-tag")).toHaveText("Practice only");
  await expect(page.locator(".lesson-wallet")).toContainText("1000.00");
  await expect(page.locator(".wallet strong")).toHaveText("1000.71056");
  await page.getByRole("button", { name: "Place buy order" }).click();
  await advance(page, request, 180);
  await expect(page.getByLabel("Scenario result")).toContainText(
    "Practice result",
  );
  await expect(page.locator(".wallet strong")).toHaveText("1000.71056");
  await expect(
    page.getByText("Three guided scenarios · 1/3 completed"),
  ).toBeVisible();
});
test("T1: three distinct scenarios earn generator marker; GTC and perpetuals stay unavailable", async ({
  page,
  request,
}) => {
  await login(page);
  await begin(page);
  for (let i = 1; i <= 3; i++) {
    await page.getByRole("button", { name: "Place buy order" }).click();
    await expect(page.locator(".fill-history")).toBeVisible();
    await advance(page, request, 180);
    await expect(
      page.getByText(`Three guided scenarios · ${i}/3 completed`),
    ).toBeVisible();
    if (i < 3)
      await page
        .getByRole("button", { name: "Next scenario", exact: true })
        .click();
  }
  await expect(page.getByLabel("Spot lesson")).toContainText(
    "GTC limit orders · 0/3",
  );
  await expect(
    page.getByRole("button", { name: "Perpetuals · locked" }),
  ).toBeDisabled();
  await nav(page, "Village").click();
  await expect(
    page.locator(".generator").filter({ hasText: "ETC generator" }),
  ).toContainText("1 ETC/hour");
  await expect(
    page.getByRole("button", { name: "Collect ETC", exact: true }),
  ).toBeVisible();
});
test("T5: unknown committed response locks edits, retains original key and retries once", async ({
  page,
  request,
}) => {
  await login(page);
  await begin(page);
  await page.route("**/api/mock/state", (route) => route.abort());
  await page.route("**/api/mock/order-preview", (r) => r.abort());
  let command: unknown;
  await page.route("**/api/mock/command", async (route) => {
    command = route.request().postDataJSON();
    await route.fetch();
    await route.abort();
  });
  await page.getByRole("button", { name: "Place buy order" }).click();
  await expect(page.locator(".delivery-status")).toContainText(
    "Delivery is unconfirmed",
  );
  await expect(page.getByLabel("Quantity")).toBeDisabled();
  await expect(page.locator(".wallet strong")).toHaveText("1000.00");
  await page.unroute("**/api/mock/command");
  let retry: unknown;
  await page.route("**/api/mock/command", async (route) => {
    retry = route.request().postDataJSON();
    await route.continue();
  });
  await page.getByRole("button", { name: "Retry original command" }).click();
  expect(retry).toEqual(command);
  await expect(page.locator(".wallet strong")).toHaveText("971.5775");
  expect((await state(page, request)).lesson.orders).toHaveLength(1);
});
test("T5: pending unsent command survives reload, owner-specific and double taps send once", async ({
  page,
  request,
}) => {
  await login(page);
  await begin(page);
  await page.route("**/api/mock/command", (route) => route.abort());
  await page.getByRole("button", { name: "Place buy order" }).click();
  await expect(
    page.getByRole("button", { name: "Retry original command" }),
  ).toBeVisible();
  const pending = await page.evaluate(() =>
    sessionStorage.getItem("cot.demo.pending.demo-learner"),
  );
  expect(pending).toBeTruthy();
  await page.unroute("**/api/mock/command");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry original command" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry original command" }).click();
  await expect(page.locator(".wallet strong")).toHaveText("971.5775");
  expect((await state(page, request)).lesson.orders).toHaveLength(1);
  await nav(page, "Learn").click();
  let sends = 0;
  await page.route("**/api/mock/command", async (route) => {
    sends++;
    await route.continue();
  });
  await expect(
    page.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Place buy order" })
    .evaluate((el: HTMLButtonElement) => {
      el.click();
      el.click();
    });
  await expect(page.locator(".wallet strong")).toHaveText("943.155");
  expect(sends).toBe(1);
});
test("T5: committed command is reconciled by state after reload, without a duplicate request", async ({
  page,
  request,
}) => {
  await login(page);
  await begin(page);
  await page.route("**/api/mock/state", (r) => r.abort());
  await page.route("**/api/mock/order-preview", (r) => r.abort());
  await page.route("**/api/mock/command", async (r) => {
    await r.fetch();
    await r.abort();
  });
  await page.getByRole("button", { name: "Place buy order" }).click();
  await expect(page.locator(".delivery-status")).toContainText(
    "Delivery is unconfirmed",
  );
  await page.unroute("**/api/mock/state");
  await page.unroute("**/api/mock/order-preview");
  await page.unroute("**/api/mock/command");
  let sends = 0;
  await page.route("**/api/mock/command", async (r) => {
    sends++;
    await r.continue();
  });
  await page.reload();
  await expect(page.locator(".wallet strong")).toHaveText("971.5775");
  await expect(
    page.getByRole("button", { name: "Retry original command" }),
  ).toHaveCount(0);
  expect(sends).toBe(0);
  expect((await state(page, request)).lesson.orders).toHaveLength(1);
});
test("T5: recovery storage failure prevents sending any new command", async ({
  page,
}) => {
  await login(page);
  await begin(page);
  let sends = 0;
  await page.route("**/api/mock/command", (r) => {
    sends++;
    return r.continue();
  });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith("cot.demo.pending."))
        throw new Error("storage disabled");
      return original.call(this, k, v);
    };
  });
  await page.getByRole("button", { name: "Place buy order" }).click();
  await expect(page.locator(".delivery-status")).toContainText(
    "Nothing was sent",
  );
  expect(sends).toBe(0);
  await expect(page.locator(".wallet strong")).toHaveText("1000.00");
});
for (const action of ["order", "report", "advance"] as const)
  test(`F1: ${action} discovers revoked session immediately while state is unavailable`, async ({
    page,
    context,
    request,
  }) => {
    await login(page);
    await begin(page);
    if (action === "report") {
      await advance(page, request, 180);
      await expect(page.getByLabel("Scenario result")).toBeVisible();
    }
    await page.route("**/api/mock/state", (r) => r.abort());
    await page.route("**/api/mock/order-preview", (r) => r.abort());
    const b = await context.newPage();
    await login(b, "learner", "B");
    if (action === "order")
      await page.getByRole("button", { name: "Place buy order" }).click();
    else if (action === "report")
      await page
        .getByRole("button", { name: "View replay", exact: true })
        .click();
    else {
      await page.locator(".developer-tools summary").click();
      await page.getByRole("button", { name: "Advance lesson 20s" }).click();
    }
    await expect(
      page.getByRole("dialog", { name: "Signed in on another device" }),
    ).toBeVisible();
    await expect(nav(page, "Village")).toHaveCount(0);
    await expect(nav(b, "Village")).toBeVisible();
  });
test("T7: active lesson and result fit320/390/736 with usable controls", async ({
  page,
  request,
}) => {
  await login(page);
  await begin(page);
  for (const width of [320, 390, 736]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const issues = await page.locator(".app-frame").evaluate((root) => {
      const r = [...root.querySelectorAll("button,input,select")]
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
    expect(issues).toBe(false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Sell", exact: true }).click();
  await page.getByRole("button", { name: "Place sell order" }).click();
  await expect(page.locator(".delivery-status")).toContainText(
    "Not enough owned asset",
  );
  await page.getByRole("button", { name: "Review order", exact: true }).click();
  await page.getByRole("button", { name: "Buy", exact: true }).click();
  await page.getByRole("button", { name: "Place buy order" }).click();
  await advance(page, request, 60);
  await expect(page.locator(".observation")).toContainText("20 seconds");
  await page.screenshot({
    path: "test-results/market-mobile.png",
    fullPage: true,
  });
  await advance(page, request, 180);
  await expect(page.getByLabel("Scenario result")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("T5: uncertain5xx retains original command; pending recovery is isolated by player", async ({
  page,
}) => {
  await login(page);
  await begin(page);
  await expect(page.locator("#order-limits")).toContainText("175.916967 ETC");
  await page.route("**/api/mock/command", async (r) => {
    await r.fetch();
    await r.fulfill({
      status: 500,
      json: { error: { code: "DEMO_ERROR", message: "Unknown completion." } },
    });
  });
  await page.route("**/api/mock/state", (r) => r.abort());
  await page.route("**/api/mock/order-preview", (r) => r.abort());
  await page.getByRole("button", { name: "Place buy order" }).click();
  await expect(page.locator(".delivery-status")).toContainText(
    "Delivery is unconfirmed",
  );
  await expect(page.getByLabel("Quantity")).toBeDisabled();
  const saved = await page.evaluate(() =>
    sessionStorage.getItem("cot.demo.pending.demo-learner"),
  );
  expect(saved).toBeTruthy();
  await nav(page, "Sign out").click();
  await page.unroute("**/api/mock/state");
  await page.unroute("**/api/mock/order-preview");
  await page.unroute("**/api/mock/command");
  await page.getByLabel("Account name").fill("trader");
  await page.getByLabel("Four-digit PIN").fill("0042");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Welcome, trader", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry original command" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("cot.demo.pending.demo-learner"),
    ),
  ).toBe(saved);
  await begin(page);
  await expect(page.getByLabel("Quantity")).toBeEnabled();
  await expect(page.locator(".wallet strong")).toHaveText("1000.00");
});

test("T3/T4: returning holder's Fast-forward results agree with the endpoint replay", async ({
  page,
  request,
}) => {
  await login(page, "trader");
  await begin(page);
  await page.getByRole("button", { name: "Place buy order" }).click();
  await expect(page.locator(".wallet strong")).toHaveText("971.5775");
  await advance(page, request, 80);
  await page.getByRole("button", { name: "Fast-forward", exact: true }).click();
  await expect(page.getByLabel("Lesson time remaining")).toHaveText("00:00");
  await expect(page.locator(".lesson-wallet .metrics")).toContainText(
    "1117.2428",
  );
  const s = await state(page, request);
  expect(s.lesson.portfolioValueChange).toBe("3.5528");
  expect(s.lesson.quotes[0].price).toBe("5.826612");
  await page.getByRole("button", { name: "View replay", exact: true }).click();
  await expect(
    page.getByLabel("Scenario replay").locator(".metrics"),
  ).toContainText("3.5528");
});

test("T5: late response from a replaced session cannot erase a newer pending intent", async ({
  page,
  context,
  request,
}) => {
  await login(page);
  await begin(page);
  let oldReady!: () => void,
    newReady!: () => void,
    releaseOld!: () => void,
    releaseNew!: () => void,
    count = 0;
  const oldCaptured = new Promise<void>((r) => {
      oldReady = r;
    }),
    newCaptured = new Promise<void>((r) => {
      newReady = r;
    }),
    oldHold = new Promise<void>((r) => {
      releaseOld = r;
    }),
    newHold = new Promise<void>((r) => {
      releaseNew = r;
    });
  await page.route("**/api/mock/command", async (route) => {
    count++;
    if (count === 1) {
      const response = await route.fetch();
      oldReady();
      await oldHold;
      await route.fulfill({
        response,
        headers: { ...response.headers(), "x-old-command": "yes" },
      });
    } else {
      newReady();
      await newHold;
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "Place buy order" }).click();
  await oldCaptured;
  const other = await context.newPage();
  await login(other, "learner", "B");
  const dialog = page.getByRole("dialog", {
    name: "Signed in on another device",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await page.getByLabel("Four-digit PIN").fill("0073");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Welcome, learner", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume demonstration", exact: true })
    .click();
  await expect(page.getByLabel("Quantity")).toBeEnabled();
  await page.getByLabel("Quantity").fill("1");
  await expect(
    page.getByRole("button", { name: "Place buy order", exact: true }),
  ).toBeEnabled();
  await page.route("**/api/mock/state", (r) => r.abort());
  await page.route("**/api/mock/order-preview", (r) => r.abort());
  await page.getByRole("button", { name: "Place buy order" }).click();
  await newCaptured;
  const newer = await page.evaluate(() =>
    sessionStorage.getItem("cot.demo.pending.demo-learner"),
  );
  expect(newer).toBeTruthy();
  const staleResponse = page.waitForResponse(
    (r) => r.headers()["x-old-command"] === "yes",
  );
  releaseOld();
  await staleResponse;
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("cot.demo.pending.demo-learner"),
    ),
  ).toBe(newer);
  await expect(page.getByLabel("Quantity")).toBeDisabled();
  releaseNew();
  await expect(page.getByLabel("Quantity")).toBeEnabled();
  expect((await state(page, request)).lesson.orders).toHaveLength(2);
  expect(count).toBe(2);
});
