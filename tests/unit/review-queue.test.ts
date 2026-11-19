// @vitest-environment jsdom
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));

import { ReviewQueue } from "@/components/ReviewQueue";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const card = (id: number) => ({
  id,
  cardType: "definition" as const,
  front: `Q${id}`,
  back: `A${id}`,
  source: { id: 1, title: "Source" },
  // Again in 1 minute, Hard in 10 minutes, Good in 1 day, Easy in 4 days.
  nextIn: [60_000, 600_000, 86_400_000, 4 * 86_400_000],
});

describe("ReviewQueue", () => {
  it("starts again at the first card after Check for more", async () => {
    // Arrange: grade the only due card, so the queue is cleared.
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(ReviewQueue, { cards: [card(9)], dueTotal: 1 })));
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: true })));
    const click = (selector: string) => host.querySelector<HTMLElement>(selector)!.click();
    await act(async () => click('[data-testid="reveal-button"]'));
    await act(async () => click('[data-testid="grade-3"]'));
    await act(async () => click('[data-testid="review-done"] button'));

    // Act: the refresh brings in three newly due cards.
    await act(async () =>
      root.render(createElement(ReviewQueue, { cards: [card(1), card(2), card(3)], dueTotal: 3 })),
    );

    // Assert
    expect(host.textContent).toContain("Q1");
  });

  it("labels each grade with when the card comes back", async () => {
    // Arrange
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () =>
      root.render(createElement(ReviewQueue, { cards: [card(4)], dueTotal: 1 })),
    );

    // Act
    await act(async () =>
      host.querySelector<HTMLElement>('[data-testid="reveal-button"]')!.click(),
    );

    // Assert
    const good = host.querySelector('[data-testid="grade-3"]')!.textContent;
    expect(good).toBe("Goodin 1 day");
  });

  it("ends a round with when the graded cards come back", async () => {
    // Arrange: two due cards, both graded Good (back in 1 day).
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(ReviewQueue, { cards: [card(5), card(6)], dueTotal: 2 }),
      ),
    );
    vi.stubGlobal("fetch", async () => new Response("{}"));
    const click = (selector: string) =>
      host.querySelector<HTMLElement>(selector)!.click();

    // Act
    await act(async () => click('[data-testid="reveal-button"]'));
    await act(async () => click('[data-testid="grade-3"]'));
    await act(async () => click('[data-testid="reveal-button"]'));
    await act(async () => click('[data-testid="grade-3"]'));

    // Assert
    const done = host.querySelector('[data-testid="review-done"]')!.textContent;
    expect(done).toContain("Back in 1 day2 cards");
  });
});
