import { test, expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

// The dev server is started by playwright.config.ts with USE_FAKE_AI=1 and a
// dedicated DATABASE_PATH, so these tests run against the real Next.js app
// end-to-end (extraction, DB writes, FSRS-6, embeddings, PDF parsing via unpdf,
// PDF/Anki export) — only the Anthropic calls are stubbed by the fake module.
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

// Drain the review queue, grading every due card "Good", until it clears.
async function drainReviewQueue(page: Page) {
  for (let i = 0; i < 80; i++) {
    if (await page.getByTestId("review-done").isVisible().catch(() => false)) break;
    if (await page.getByTestId("review-empty").isVisible().catch(() => false)) break;
    await page.getByTestId("reveal-button").click();
    await page.getByTestId("grade-3").click();
    // Wait for the grade to commit: either the next card's reveal button
    // reappears, or the queue-cleared screen shows.
    await page.waitForFunction(
      () =>
        !!document.querySelector('[data-testid="review-done"]') ||
        !!document.querySelector('[data-testid="reveal-button"]'),
    );
  }
}

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

    // A scaled set of cards is generated (more than the old fixed three).
    const cards = page.locator('[data-testid^="card-"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
  });

  test("generate more cards appends new cards to a source", async ({ page }) => {
    await page.goto("/library");
    await page.locator('[data-testid^="source-item-"]').first().locator("h3 a").click();
    await expect(page.getByTestId("cards-section")).toBeVisible();

    const cards = page.locator('[data-testid^="card-"]');
    const before = await cards.count();

    await page.getByTestId("generate-more-cards").click();
    await expect(page.getByTestId("cards-added")).toBeVisible({ timeout: 30_000 });

    expect(await cards.count()).toBeGreaterThan(before);
  });

  test("review queue surfaces new cards and grading reschedules them", async ({ page }) => {
    await page.goto("/review");

    await expect(page.getByTestId("review-card")).toBeVisible();
    await expect(page.getByTestId("card-front")).toBeVisible();

    await drainReviewQueue(page);
    await expect(page.getByTestId("review-done")).toBeVisible();

    // Refresh: queue should now be empty (all cards rescheduled to 1 day out).
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

  test("create a shareable deck, study it, and export it", async ({ page }) => {
    await page.goto("/decks");

    await page.getByTestId("deck-title").fill("Moats — Week 3");
    await page.getByTestId("deck-description").fill("Focus on why distribution and brand win.");

    // Select every available source (scope to inputs so we don't match the
    // deck-source-list <ul> wrapper).
    const checkboxes = page.locator('input[data-testid^="deck-source-"]');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < count; i++) await checkboxes.nth(i).check();

    await page.getByTestId("create-deck").click();

    // Deck appears in the list with a populated share link. Scope to the deck
    // <li> items (testid deck-<id>) so we don't match the create-form inputs.
    const deck = page.getByTestId("decks-list").locator('li[data-testid^="deck-"]').first();
    await expect(deck).toBeVisible({ timeout: 15_000 });
    const linkInput = deck.locator('[data-testid^="deck-link-"]');
    const shareUrl = await linkInput.inputValue();
    expect(shareUrl).toMatch(/\/d\/[a-f0-9]{32}$/);
    const token = shareUrl.split("/d/")[1];

    // Student study page: no app nav, flashcards present, reveal + next works.
    await page.goto(`/d/${token}`);
    await expect(page.getByTestId("deck-title")).toContainText("Moats — Week 3");
    await expect(page.getByTestId("nav-capture")).toHaveCount(0); // chrome hidden
    await expect(page.getByTestId("study-front")).toBeVisible();
    await page.getByTestId("study-reveal").click();
    await expect(page.getByTestId("study-back")).toBeVisible();
    await page.getByTestId("study-next").click();
    await expect(page.getByTestId("study-progress")).toContainText("Card 2 of");

    // Browse mode lists all cards.
    await page.getByTestId("mode-browse").click();
    await expect(page.getByTestId("browse-list")).toBeVisible();

    // Exports return the right content types.
    const pdf = await page.request.get(`/d/${token}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const anki = await page.request.get(`/d/${token}/anki`);
    expect(anki.status()).toBe(200);
    expect(anki.headers()["content-type"]).toContain("text/csv");
    expect(await anki.text()).toContain("#separator:Comma");
  });
});

test.describe("PDF capture", () => {
  test("uploading a PDF extracts text and generates cards", async ({ page }) => {
    // Build a real text-based PDF in-memory so we exercise the unpdf extractor.
    const pdfBytes = await makeSamplePdf();

    await page.goto("/");
    await page.getByTestId("pdf-input").setInputFiles({
      name: "spaced-repetition-primer.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    await page.waitForURL(/\/sources\/\d+/, { timeout: 30_000 });
    await expect(page.getByTestId("source-title")).toBeVisible();
    await expect(page.getByTestId("cards-section")).toBeVisible();
    const cards = page.locator('[data-testid^="card-"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
  });
});

test.describe("Capture form validation", () => {
  test("rejects empty input client-side", async ({ page }) => {
    await page.goto("/");
    const submit = page.getByTestId("capture-submit");
    await expect(submit).toBeDisabled();
  });
});

async function makeSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  const paragraphs = [
    "Spaced repetition schedules reviews at expanding intervals so that each",
    "fact is revisited just before it would be forgotten. The forgetting curve",
    "describes how memory decays over time, and retrieval practice strengthens",
    "the memory trace each time recall succeeds. The mechanism behind durable",
    "learning is active recall combined with spacing, which beats rereading and",
    "highlighting because effortful retrieval consolidates knowledge. Apply it",
    "whenever you must retain a large body of material over months, such as",
    "vocabulary, anatomy, or the core theorems of a field.",
  ];
  let y = 780;
  for (const line of paragraphs) {
    page.drawText(line, { x: 50, y, size: 14, font });
    y -= 26;
  }
  return doc.save();
}
