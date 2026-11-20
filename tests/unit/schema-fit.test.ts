import { describe, expect, it } from "vitest";
import { fitMoreCards, fitProcessing, fitThemes } from "@/lib/ai/schemas";

const card = { type: "definition" as const, front: "Q?", back: "A." };
const theme = { label: "T", summary: "S.", source_ids: [1, 2] };

describe("fitting a parsed reply to the app's limits", () => {
  // The schema no longer rejects these; the app trims and clamps instead.
  it("trims extra cards, takeaways and concepts and clamps weights", () => {
    const reply = {
      why_i_cared: "Because.",
      key_takeaways: Array(6).fill("One idea."),
      cards: Array(13).fill(card),
      concepts: Array(9).fill({ name: "moats", weight: 1.05 }),
    };

    const fitted = fitProcessing(reply);

    expect([
      fitted.key_takeaways.length,
      fitted.cards.length,
      fitted.concepts.length,
      fitted.concepts[0]?.weight,
    ]).toEqual([5, 12, 8, 1]);
  });

  it("drops cards whose question points at the source", () => {
    const leaning = { ...card, front: "What did the authors apply it to?" };
    const reply = {
      why_i_cared: "Because.",
      key_takeaways: ["One idea."],
      cards: [card, leaning, { ...card, front: "In this context, why?" }],
      concepts: [],
    };

    const fitted = fitProcessing(reply);

    expect(fitted.cards.map((c) => c.front)).toEqual(["Q?"]);
  });

  it("keeps every card when none stands alone, rather than none", () => {
    const leaning = { ...card, front: "What does the article argue?" };

    const fitted = fitMoreCards({ cards: [leaning] });

    expect(fitted.cards).toEqual([leaning]);
  });

  it("keeps the first five of six themes", () => {
    const fitted = fitThemes({ themes: Array(6).fill(theme) });

    expect(fitted.themes).toHaveLength(5);
  });
});
