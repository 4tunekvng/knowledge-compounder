import { test, expect, type Page } from "@playwright/test";

// At phone width nothing may push the page wider than the screen: a long
// unbroken title and the status label must both stay inside it. The menu is
// one row along the bottom edge, where a thumb reaches it.

const PHONE = { width: 390, height: 844 };
const BODY =
  "Attention is a store of value that compounds when it is kept. ".repeat(6);
const LONG_TITLE = `Compounding${"x".repeat(60)}`;

async function expectNoSideScroll(page: Page) {
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(PHONE.width);
}

test.describe("phone layout", () => {
  test.use({ viewport: PHONE });

  test.beforeAll(async ({ browser, baseURL }) => {
    const page = await browser.newPage({ baseURL });
    await page.goto("/");
    await page.getByTestId("capture-input").fill(`${LONG_TITLE}\n\n${BODY}`);
    await page.getByTestId("capture-submit").click();
    await page.waitForURL(/\/sources\/\d+/, { timeout: 30_000 });
    await page.close();
  });

  test("home and library do not scroll sideways", async ({ page }) => {
    for (const path of ["/", "/library"]) {
      await page.goto(path);
      await expect(page.getByText(LONG_TITLE).first()).toBeVisible();
      await expectNoSideScroll(page);
    }
  });

  test("the status label stays on screen", async ({ page }) => {
    await page.goto("/library");
    const status = page.getByTestId(/^source-status-/).first();
    const box = await status.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
  });

  test("the menu is one row along the bottom of the screen", async ({ page }) => {
    await page.goto("/");
    const capture = await page.getByTestId("nav-capture").boundingBox();
    const integrations = await page
      .getByTestId("nav-integrations")
      .boundingBox();
    expect(integrations!.y).toBe(capture!.y);
    expect(capture!.y + capture!.height).toBe(PHONE.height);
  });

  test("the source page does not scroll sideways", async ({ page }) => {
    await page.goto("/library");
    await page.getByRole("link", { name: LONG_TITLE }).click();
    await expect(page.getByTestId("source-title")).toBeVisible();
    await expectNoSideScroll(page);
  });
});

test.describe("the smallest phones", () => {
  const SMALL = { width: 320, height: 700 };
  test.use({ viewport: SMALL });

  test("signed-in pages fit 320px with the account in the header", async ({
    page,
  }) => {
    for (const path of ["/", "/review", "/papers"]) {
      await page.goto(path);
      await expect(page.getByTestId("sign-out")).toBeVisible();
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(SMALL.width);
    }
  });

  test("the menu names every tab, even when it shows only icons", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Imports" })).toBeVisible();
  });
});
