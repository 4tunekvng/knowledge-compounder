import { test, expect, type Page } from "@playwright/test";

// At phone width nothing may push the page wider than the screen: a long
// unbroken title and the status label must both stay inside it.

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
    const status = page.getByText("processed", { exact: true }).first();
    const box = await status.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
  });

  test("the menu is one row under the wordmark", async ({ page }) => {
    await page.goto("/");
    const capture = await page.getByTestId("nav-capture").boundingBox();
    const integrations = await page
      .getByTestId("nav-integrations")
      .boundingBox();
    expect(integrations!.y).toBe(capture!.y);
  });

  test("the source page does not scroll sideways", async ({ page }) => {
    await page.goto("/library");
    await page.getByRole("link", { name: LONG_TITLE }).click();
    await expect(page.getByTestId("source-title")).toBeVisible();
    await expectNoSideScroll(page);
  });
});
