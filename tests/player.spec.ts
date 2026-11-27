import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function login(
  page: Page,
  device: string,
  username = "learner",
  pin = "0073",
) {
  await page.goto(`/?device=${device}`);
  await page.getByLabel("Account name").fill(username);
  await page.getByLabel("Four-digit PIN").fill(pin);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText(`Welcome, ${username}`, { exact: true }),
  ).toBeVisible();
}
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Player navigation" })
    .getByRole("button", { name, exact: true });
async function checkTargets(page: Page) {
  const overlaps = await page.evaluate(() => {
    const modal = document.querySelector("dialog[open]");
    const nodes = (modal ||
      document.querySelector(".app-frame"))!.querySelectorAll("button");
    const rects = [...nodes]
      .map((n) => ({
        ...n.getBoundingClientRect().toJSON(),
        label: n.textContent?.trim().slice(0, 60),
      }))
      .filter((r) => r.width && r.height);
    const pairs: string[] = [];
    rects.forEach((a, i) =>
      rects.slice(i + 1).forEach((b) => {
        if (
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
        )
          pairs.push(`${innerWidth}: ${a.label} overlaps ${b.label}`);
      }),
    );
    return pairs;
  });
  expect(overlaps).toEqual([]);
}
test.beforeEach(async ({ request }) => {
  await request.post("/api/mock/dev-reset");
});

test("lowercase-only inline validation and leading-zero PIN login", async ({
  page,
}) => {
  await page.goto("/?device=A");
  for (const value of ["LEARNER", "learn3r", "learn_er", "learn!"]) {
    await page.getByLabel("Account name").fill(value);
    await expect(page.locator("#username-help")).toHaveText(
      "Only lowercase account names (a–z) are accepted.",
    );
    await expect(page.getByLabel("Account name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByLabel("Account name")).toHaveValue(value);
  }
  await page.getByLabel("Account name").fill("visitor");
  await page.getByLabel("Four-digit PIN").fill("0000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Welcome, visitor")).toBeVisible();
  await nav(page, "Portfolio").click();
  await expect(
    page
      .locator(".storage-table")
      .getByRole("row")
      .filter({
        has: page.getByRole("rowheader", { name: "Demo USD", exact: true }),
      })
      .getByRole("cell", { name: "1000.00", exact: true })
      .first(),
  ).toBeVisible();
});

test("PIN accepts only four ASCII digits across keyboard, paste and selection edits", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?device=A");
  await page.getByLabel("Account name").fill("learner");
  const pin = page.getByLabel("Four-digit PIN");
  const help = page.locator("#pin-help");
  const paste = async (text: string) => {
    await page.evaluate((text) => navigator.clipboard.writeText(text), text);
    await pin.focus();
    await pin.press("ControlOrMeta+V");
  };
  await pin.pressSequentially("00");
  for (const key of ["a", "!", " "]) {
    await pin.press(key);
    await expect(pin).toHaveValue("00");
    await expect(help).toHaveText("Only numbers from 0 to 9 are allowed.");
    await expect(help).toHaveAttribute("role", "alert");
    await expect(pin).toHaveAttribute("aria-invalid", "true");
  }
  await page.keyboard.insertText("１２");
  await expect(pin).toHaveValue("00");
  await expect(help).toHaveText("Only numbers from 0 to 9 are allowed.");
  await pin.pressSequentially("73");
  await expect(pin).toHaveValue("0073");
  await expect(pin).toHaveAttribute("aria-invalid", "false");
  await expect(pin).toHaveAttribute("maxlength", "4");
  await pin.pressSequentially("1234567890");
  await expect(pin).toHaveValue("0073");
  await pin.press("a");
  await expect(pin).toHaveValue("0073");
  await expect(help).toHaveText("Only numbers from 0 to 9 are allowed.");
  await page.screenshot({
    path: "test-results/pin-validation.png",
    fullPage: true,
  });
  await pin.press("ControlOrMeta+A");
  await pin.press("Backspace");
  await expect(pin).toHaveValue("");
  await paste("0123456789");
  await expect(pin).toHaveValue("0123");
  await pin.press("ControlOrMeta+A");
  await paste("0073abc");
  await expect(pin).toHaveValue("0123");
  await expect(help).toHaveText("Only numbers from 0 to 9 are allowed.");
  await pin.press("ControlOrMeta+A");
  await paste("0073");
  await expect(pin).toHaveValue("0073");
  await expect(pin).toHaveAttribute("aria-invalid", "false");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Welcome, learner")).toBeVisible();
});

test("PIN rejects fresh non-keyboard input at capacity and mixed text dropped into the field", async ({
  page,
}) => {
  await page.goto("/?device=A");
  const pin = page.getByLabel("Four-digit PIN");
  await pin.fill("0073");
  await expect(pin).toHaveAttribute("aria-invalid", "false");
  await page.keyboard.insertText("１２");
  await expect(pin).toHaveValue("0073");
  await expect(page.locator("#pin-help")).toHaveText(
    "Only numbers from 0 to 9 are allowed.",
  );
  await pin.fill("");
  await page.evaluate(() => {
    const source = document.createElement("div");
    source.id = "pin-drag-fixture";
    source.textContent = "Drag PIN fixture";
    source.draggable = true;
    source.style.cssText =
      "position:fixed;top:0;left:0;padding:12px;background:white;z-index:9999";
    source.addEventListener("dragstart", (event) =>
      event.dataTransfer!.setData("text/plain", "0073abc"),
    );
    document.body.append(source);
  });
  await page.locator("#pin-drag-fixture").dragTo(pin);
  await expect(pin).toHaveValue("");
  await expect(page.locator("#pin-help")).toHaveText(
    "Only numbers from 0 to 9 are allowed.",
  );
});

test("late poll after logout cannot restore a signed-out account", async ({
  page,
}) => {
  await login(page, "A");
  await expect(nav(page, "Village")).toBeVisible();
  let release!: () => void;
  let captured!: () => void;
  let held = false;
  const ready = new Promise<void>((resolve) => {
    captured = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/mock/state", async (route) => {
    const response = await route.fetch();
    if (!held) {
      held = true;
      captured();
      await hold;
      await route.fulfill({
        response,
        headers: { ...response.headers(), "x-cot-old-context": "yes" },
      });
    } else await route.fulfill({ response });
  });
  await ready;
  await nav(page, "Sign out").click();
  const oldResponse = page.waitForResponse(
    (response) => response.headers()["x-cot-old-context"] === "yes",
  );
  release();
  await oldResponse;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByLabel("Account name")).toBeVisible();
  await expect(nav(page, "Village")).toHaveCount(0);
});

test("failed logout retains the session across reload and can be retried", async ({
  page,
}) => {
  await login(page, "A");
  await expect(nav(page, "Village")).toBeVisible();
  await page.route("**/api/mock/sign-out", (route) => route.abort());
  await nav(page, "Sign out").click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Sign out could not be confirmed" }),
  ).toContainText("Sign out could not be confirmed");
  await page.reload();
  await expect(nav(page, "Village")).toBeVisible();
  await page.unroute("**/api/mock/sign-out");
  await nav(page, "Sign out").click();
  await expect(page.getByLabel("Account name")).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("cot.demo.token.A")),
  ).toBeNull();
});

test("reset is serialized against pending sign-in and leaves a usable login form", async ({
  page,
}) => {
  await page.goto("/?device=A");
  await page
    .getByText("Developer tools · fake accounts and simulated devices", {
      exact: true,
    })
    .click();
  let release!: () => void;
  let captured!: () => void;
  const ready = new Promise<void>((resolve) => {
    captured = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/mock/sign-in", async (route) => {
    const response = await route.fetch();
    captured();
    await hold;
    await route.fulfill({ response });
  });
  await page.getByLabel("Account name").fill("learner");
  await page.getByLabel("Four-digit PIN").fill("0073");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready;
  const reset = page.getByRole("button", { name: "Reset demo data" });
  await expect(reset).toBeDisabled();
  release();
  await expect(nav(page, "Village")).toBeVisible();
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(page.getByLabel("Account name")).toBeVisible();
  await page.unroute("**/api/mock/sign-in");
  await page.getByLabel("Four-digit PIN").fill("0073");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(nav(page, "Village")).toBeVisible();
});

test("a delayed reset response cannot clear a newer signed-in session", async ({
  page,
}) => {
  await login(page, "A");
  await expect(nav(page, "Village")).toBeVisible();
  await page
    .getByText("Developer tools · fake accounts and simulated devices", {
      exact: true,
    })
    .click();
  let release!: () => void;
  let captured!: () => void;
  const ready = new Promise<void>((resolve) => {
    captured = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/mock/dev-reset", async (route) => {
    const response = await route.fetch();
    captured();
    await hold;
    await route.fulfill({
      response,
      headers: { ...response.headers(), "x-cot-reset-delayed": "yes" },
    });
  });
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await ready;
  await expect(page.getByLabel("Account name")).toBeVisible();
  await page.getByLabel("Four-digit PIN").fill("0073");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(nav(page, "Village")).toBeVisible();
  const delayed = page.waitForResponse(
    (response) => response.headers()["x-cot-reset-delayed"] === "yes",
  );
  release();
  await delayed;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(nav(page, "Village")).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("cot.demo.token.A")),
  ).not.toBeNull();
});

test("offline recovery keeps the same lesson id and deadline", async ({
  page,
  context,
}) => {
  await login(page, "A");
  await page.getByRole("button", { name: "Start learning" }).click();
  const id = await page.getByTestId("lesson-id").textContent();
  const deadline = await page.getByTestId("lesson-deadline").textContent();
  await context.setOffline(true);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "shared lesson clock continues" }),
  ).toContainText("shared lesson clock continues");
  await context.setOffline(false);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "shared lesson clock continues" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("lesson-id")).toHaveText(id!);
  await expect(page.getByTestId("lesson-deadline")).toHaveText(deadline!);
});

test("responsive login/player screens and keyboard labels", async ({
  page,
}) => {
  for (const width of [320, 390, 736]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?device=A");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await checkTargets(page);
  }
  await page.getByLabel("Account name").focus();
  await expect(page.getByLabel("Account name")).toBeFocused();
  await page.getByLabel("Account name").fill("learner");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Four-digit PIN")).toBeFocused();
  await page.getByLabel("Four-digit PIN").fill("0073");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  for (const width of [320, 390, 736]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ["Village", "Learn", "Portfolio"]) {
      await nav(page, tab).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await checkTargets(page);
    }
  }
  await page.screenshot({
    path: "test-results/player-portfolio.png",
    fullPage: true,
  });
});

test("HTTP routes reject missing/forged ownership and keep invalid credentials private", async ({
  request,
}) => {
  const anonymous = await request.get("/api/mock/state");
  expect(anonymous.status()).toBe(401);
  const invalid = await request.post("/api/mock/sign-in", {
    data: { username: "Learner", pin: "0073", deviceId: "A" },
  });
  expect(invalid.status()).toBe(400);
  const injected = await request.post("/api/mock/sign-in", {
    data: {
      username: "learner",
      pin: "0073",
      deviceId: "A",
      playerId: "demo-trader",
    },
  });
  expect(injected.status()).toBe(400);
  const login = await request.post("/api/mock/sign-in", {
    data: { username: "learner", pin: "0073", deviceId: "A" },
  });
  const { token } = await login.json();
  const own = await request.get("/api/mock/state?playerId=demo-trader", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect((await own.json()).playerId).toBe("demo-learner");
  const wrong = await request.post("/api/mock/sign-in", {
    data: { username: "learner", pin: "1234", deviceId: "B" },
  });
  const body = await wrong.json();
  expect(wrong.status()).toBe(401);
  expect(body.devices).toBeUndefined();
});

test("new-device login signs out the old device, keeps the lesson and shows no routine device diagnostics", async ({
  page: a,
  context,
}) => {
  await login(a, "A");
  await a.getByRole("button", { name: "Start learning" }).click();
  const lesson = await a.getByTestId("lesson-id").textContent(),
    deadline = await a.getByTestId("lesson-deadline").textContent();
  const b = await context.newPage();
  await login(b, "B");
  const notice = a.getByRole("dialog", { name: "Signed in on another device" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("You have signed in on another device.");
  await expect(
    notice.getByRole("button", { name: "OK", exact: true }),
  ).toBeFocused();
  await expect(nav(a, "Village")).toHaveCount(0);
  expect(
    await a.evaluate(() => sessionStorage.getItem("cot.demo.token.A")),
  ).toBeNull();
  await a.setViewportSize({ width: 320, height: 844 });
  await checkTargets(a);
  await a.screenshot({
    path: "test-results/session-replaced.png",
    fullPage: true,
  });
  await notice.getByRole("button", { name: "OK", exact: true }).click();
  await expect(a.getByLabel("Account name")).toBeVisible();
  await a.reload();
  await expect(a.getByLabel("Account name")).toBeVisible();
  await nav(b, "Learn").click();
  await expect(b.getByTestId("lesson-id")).toHaveText(lesson!);
  await expect(b.getByTestId("lesson-deadline")).toHaveText(deadline!);
  for (const tab of ["Village", "Learn", "Portfolio"]) {
    await nav(b, tab).click();
    await expect(
      b.locator(".app-frame").getByText(/devices signed in|active here/i),
    ).toHaveCount(0);
    await expect(b.locator(".device-badge")).toHaveCount(0);
    await expect(
      b.getByRole("button", { name: "Continue on this device" }),
    ).toHaveCount(0);
  }
  await nav(b, "Village").click();
  await b.screenshot({
    path: "test-results/single-session-village.png",
    fullPage: true,
  });
  const token = await b.evaluate(() =>
    sessionStorage.getItem("cot.demo.token.B"),
  );
  expect(
    (
      await context.request.post("/api/mock/activate", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await context.request.get("/api/mock/state", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(200);
  for (const device of ["C", "D"]) {
    const next = await context.newPage();
    await login(next, device);
    await expect(next.getByRole("dialog")).toHaveCount(0);
  }
});
test("same-device rotation, logout, reset and unknown tokens do not show a false elsewhere dialog", async ({
  page,
  context,
}) => {
  await login(page, "A");
  const again = await context.newPage();
  await login(again, "A");
  await expect(page.getByLabel("Account name")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(again, "Sign out").click();
  await expect(again.getByLabel("Account name")).toBeVisible();
  await expect(again.getByRole("dialog")).toHaveCount(0);
  await login(again, "A");
  await context.request.post("/api/mock/dev-reset");
  await expect(again.getByLabel("Account name")).toBeVisible();
  await expect(again.getByRole("dialog")).toHaveCount(0);
  const unknown = await context.newPage();
  await unknown.addInitScript(() =>
    sessionStorage.setItem(
      "cot.demo.token.A",
      "00000000-0000-4000-8000-000000000000",
    ),
  );
  await unknown.goto("/?device=A");
  await expect(unknown.getByLabel("Account name")).toBeVisible();
  await expect(unknown.getByRole("dialog")).toHaveCount(0);
});
test("a delayed active snapshot cannot restore a session after another-device login", async ({
  page: a,
  context,
}) => {
  await login(a, "A");
  let release!: () => void,
    captured!: () => void,
    held = false;
  const ready = new Promise<void>((resolve) => {
      captured = resolve;
    }),
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
  await a.route("**/api/mock/state", async (route) => {
    const response = await route.fetch();
    if (!held && response.status() === 200) {
      held = true;
      captured();
      await hold;
      await route.fulfill({
        response,
        headers: { ...response.headers(), "x-cot-delayed": "yes" },
      });
    } else await route.fulfill({ response });
  });
  await ready;
  const b = await context.newPage();
  await login(b, "B");
  const notice = a.getByRole("dialog", { name: "Signed in on another device" });
  await expect(notice).toBeVisible();
  const old = a.waitForResponse(
    (response) => response.headers()["x-cot-delayed"] === "yes",
  );
  release();
  await old;
  await a.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(notice).toBeVisible();
  await expect(nav(a, "Village")).toHaveCount(0);
});
test("sign-out first discovering replacement shows the notice without ending the new session", async ({
  page: a,
  context,
}) => {
  await login(a, "A");
  await a.route("**/api/mock/state", (route) => route.abort());
  const b = await context.newPage();
  await login(b, "B");
  await nav(a, "Sign out").click();
  await expect(
    a.getByRole("dialog", { name: "Signed in on another device" }),
  ).toBeVisible();
  await expect(nav(a, "Village")).toHaveCount(0);
  await expect(nav(b, "Village")).toBeVisible();
  const token = await b.evaluate(() =>
    sessionStorage.getItem("cot.demo.token.B"),
  );
  expect(
    (
      await context.request.get("/api/mock/state", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(200);
});
test("an offline old device is signed out when it reconnects after a different-device login", async ({
  page: a,
  context,
  browser,
  baseURL,
}) => {
  await login(a, "A");
  await context.setOffline(true);
  await expect(a.getByRole("status")).toContainText(
    "shared lesson clock continues",
  );
  const secondContext = await browser.newContext({ baseURL });
  try {
    const b = await secondContext.newPage();
    await login(b, "B");
    await context.setOffline(false);
    await expect(
      a.getByRole("dialog", { name: "Signed in on another device" }),
    ).toBeVisible();
    await expect(nav(a, "Village")).toHaveCount(0);
    await expect(nav(b, "Village")).toBeVisible();
  } finally {
    await context.setOffline(false);
    await secondContext.close();
  }
});

for (const replacement of [
  { device: "B", showNotice: true },
  { device: "A", showNotice: false },
]) {
  test(`lesson-start first discovering an ended session clears auth with state unavailable: ${replacement.device}`, async ({
    page: a,
    context,
  }) => {
    await login(a, "A");
    await a.route("**/api/mock/state", (route) => route.abort());
    const current = await context.newPage();
    await login(current, replacement.device);
    await a.getByRole("button", { name: "Start learning" }).click();
    if (replacement.showNotice)
      await expect(
        a.getByRole("dialog", { name: "Signed in on another device" }),
      ).toBeVisible();
    else {
      await expect(a.getByLabel("Account name")).toBeVisible();
      await expect(a.getByRole("dialog")).toHaveCount(0);
    }
    await expect(nav(a, "Village")).toHaveCount(0);
    expect(
      await a.evaluate(() => sessionStorage.getItem("cot.demo.token.A")),
    ).toBeNull();
    const token = await current.evaluate(
      (device) => sessionStorage.getItem(`cot.demo.token.${device}`),
      replacement.device,
    );
    const response = await context.request.get("/api/mock/state", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(200);
    const state = await response.json();
    expect(state.lesson).toBeNull();
    expect(state.demoUsd).toBe("1000.00");
  });
}
