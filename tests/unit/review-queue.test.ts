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
});

describe("ReviewQueue", () => {
  it("starts again at the first card after Refresh queue", async () => {
    // Arrange: grade the only due card, so the queue is cleared.
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(ReviewQueue, { cards: [card(9)] })));
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: true })));
    const click = (selector: string) => host.querySelector<HTMLElement>(selector)!.click();
    await act(async () => click('[data-testid="reveal-button"]'));
    await act(async () => click('[data-testid="grade-3"]'));
    await act(async () => click('[data-testid="review-done"] button'));

    // Act: the refresh brings in three newly due cards.
    await act(async () =>
      root.render(createElement(ReviewQueue, { cards: [card(1), card(2), card(3)] })),
    );

    // Assert
    expect(host.textContent).toContain("Q1");
  });
});
