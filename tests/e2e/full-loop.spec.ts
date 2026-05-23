import { test, expect } from "@playwright/test";

// The dev server is started by playwright.config.ts with USE_FAKE_AI=1 and a
// dedicated DATABASE_PATH, so these tests run against the real Next.js app
// end-to-end (extraction, DB writes, FSRS-6, embeddings) — only the Anthropic
// calls are stubbed by the deterministic fake module.
//
// Tests run serially in one worker so they share the same fresh DB.

const SAMPLES = [
  {
    title: "Distribution outlasts data moats",
    body: `Distribution outlasts data moats in the LLM era.

The data layer commoditizes; the distribution layer compounds. Founders who optimize for owned channels — newsletter, podcast, community, brand — accumulate audience advantages that the next foundation-model release does not flatten. Distribution moats compound because trust compounds.

By contrast, proprietary data has been the headline moat narrative for the last decade, and most of those moats are weaker than they look. Foundation models close the gap on data through scale, synthetic data, and aggregation across customers. The result is that data moats erode while distribution moats persist. The implication for founders is direct: spend the next year building distribution before building product.`,
  },
  {
    title: "Brand is the slowest-decaying moat",
    body: `Brand is the slowest-decaying moat available to a software company.

Network effects degrade as switching costs collapse. Data moats erode as foundation models commoditize the data layer. Distribution moats are real but expensive to maintain. Brand sits underneath all three: it is the only moat that compounds with every customer interaction without paying a recurring infrastructure tax.

The mechanism is reputation flywheels. A user who trusts the brand defaults to it for the next adjacent product, which lets the company expand with sub-linear marketing spend. Stripe and Linear are textbook cases. The moat is not technology; it is the accumulated trust the brand has earned over years of consistent product behavior.`,
  },
  {
    title: "Network effects in the LLM era",
    body: `Network effects degrade in the LLM era.

The classic two-sided marketplace network effect — every new user makes the product more valuable to every existing user — depended on switching costs that LLMs have made cheap. When AI agents can replicate the value of the network's content or coordination on demand, the network's pricing power collapses.

The remaining defensible moats are distribution and brand. Both are slower to build than network effects but harder to displace once built. Founders who optimized for network effects in the 2010s should reread the playbook: the next decade rewards owned distribution channels and trusted brands more than aggregator dynamics.`,
  },
];

test.describe("Knowledge Compounder full loop", () => {
  test.describe.configure({ mode: "serial" });

  test("first capture: empty state, then captured source detail", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("empty-state")).toBeVisible();

    await page.getByTestId("capture-input").fill(SAMPLES[0].body);
    await page.getByTestId("capture-submit").click();

    await page.waitForURL(/\/sources\/\d+/, { timeout: 30_000 });

    await expect(page.getByTestId("source-title")).toContainText(/Distribution/i);
    await expect(page.getByTestId("why-i-cared")).toBeVisible();
    await expect(page.getByTestId("takeaways")).toBeVisible();
    await expect(page.getByTestId("cards-section")).toBeVisible();

    // Three cards generated.
    const cards = page.locator('[data-testid^="card-"]');
    await expect(cards).toHaveCount(3);
  });

  test("library lists captured sources", async ({ page }) => {
    await page.goto("/library");
    const items = page.locator('[data-testid^="source-item-"]');
    await expect(items).toHaveCount(1);
  });

  test("review queue surfaces new cards and grading reschedules them", async ({ page }) => {
    await page.goto("/review");

    await expect(page.getByTestId("review-card")).toBeVisible();
    await expect(page.getByTestId("card-front")).toBeVisible();

    // Grade all 3 cards as Good (FSRS rating 3) — back of card revealed first each time.
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("reveal-button").click();
      await expect(page.getByTestId("card-back")).toBeVisible();
      await page.getByTestId("grade-3").click();
    }

    await expect(page.getByTestId("review-done")).toBeVisible();

    // Refresh: queue should now be empty (all 3 cards rescheduled to 1 day out).
    await page.goto("/review");
    await expect(page.getByTestId("review-empty")).toBeVisible();
  });

  test("capturing 2 more sources enables theme detection and cross-links", async ({ page }) => {
    for (const sample of SAMPLES.slice(1)) {
      await page.goto("/");
      await page.getByTestId("capture-input").fill(sample.body);
      await page.getByTestId("capture-submit").click();
      await page.waitForURL(/\/sources\/\d+/, { timeout: 30_000 });
      await expect(page.getByTestId("why-i-cared")).toBeVisible();
    }

    // Library now shows 3 sources.
    await page.goto("/library");
    const items = page.locator('[data-testid^="source-item-"]');
    await expect(items).toHaveCount(3);

    // Cross-links — open the first source and confirm at least one related capture.
    const firstSource = items.first();
    const firstSourceLink = firstSource.locator("h3 a");
    await firstSourceLink.click();
    await expect(page.getByTestId("source-title")).toBeVisible();
    await expect(page.getByTestId("related-section")).toBeVisible();
  });

  test("theme detection produces themes citing the captured sources", async ({ page }) => {
    await page.goto("/themes");
    await expect(page.getByTestId("themes-empty")).toBeVisible();

    await page.getByTestId("find-themes-button").click();
    await expect(page.getByTestId("themes-list")).toBeVisible({ timeout: 30_000 });

    const themes = page.locator('[data-testid^="theme-"]');
    await expect(themes.first()).toBeVisible();
    const themeCount = await themes.count();
    expect(themeCount).toBeGreaterThanOrEqual(1);
  });

  test("essay drafting renders Markdown with citations", async ({ page }) => {
    await page.goto("/themes");
    const firstTheme = page.locator('[data-testid^="theme-"]').first();
    await expect(firstTheme).toBeVisible();

    const themeIdAttr = await firstTheme.getAttribute("data-testid");
    const themeId = themeIdAttr!.replace("theme-", "");

    await page.getByTestId(`draft-essay-${themeId}`).click();

    await page.waitForURL(/\/essays\/\d+/, { timeout: 30_000 });

    await expect(page.getByTestId("essay-title")).toBeVisible();
    await expect(page.getByTestId("essay-body")).toBeVisible();
    await expect(page.getByTestId("essay-citations")).toBeVisible();

    const bodyHtml = await page.getByTestId("essay-body").innerHTML();
    // Footnote markers should have been rendered as superscripts with anchor links.
    expect(bodyHtml).toContain("<sup>");
    expect(bodyHtml).toContain('href="#fn-1"');
  });

  test("captured essay shows up in the themes-page essays list", async ({ page }) => {
    await page.goto("/themes");
    const essaysList = page.getByTestId("essays-list");
    await expect(essaysList).toBeVisible();
    const essayLinks = essaysList.locator('[data-testid^="essay-link-"]');
    await expect(essayLinks).toHaveCount(1);
  });
});

test.describe("Capture form validation", () => {
  test("rejects empty input client-side", async ({ page }) => {
    await page.goto("/");
    const submit = page.getByTestId("capture-submit");
    // Button is disabled when input is empty
    await expect(submit).toBeDisabled();
  });
});
