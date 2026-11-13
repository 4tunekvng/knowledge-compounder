import { describe, it, expect } from "vitest";
import { schedule, retrievability, Rating, State, type CardState } from "@/lib/fsrs";

const NOW = new Date("2026-04-27T12:00:00.000Z");

function newCard(overrides: Partial<CardState> = {}): CardState {
  return {
    stability: 0,
    difficulty: 5.0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    lastReviewedAt: null,
    ...overrides,
  };
}

function days(n: number) {
  return n * 86_400_000;
}

function minutes(n: number) {
  return n * 60_000;
}

describe("FSRS-6 schedule — New card", () => {
  it("Again on a New card → Relearning, due in 5 minutes, reps reset", () => {
    const result = schedule(newCard(), Rating.Again, NOW);
    expect(result.state).toBe(State.Relearning);
    expect(result.reps).toBe(0);
    expect(result.lapses).toBe(1);
    expect(result.dueAt.getTime()).toBe(NOW.getTime() + minutes(5));
  });

  it("Hard on a New card → Review, due in ~1 day (stability ≈ W[1]=1.18)", () => {
    const result = schedule(newCard(), Rating.Hard, NOW);
    expect(result.state).toBe(State.Review);
    expect(result.reps).toBe(1);
    expect(result.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(result.scheduledDays).toBeLessThanOrEqual(2);
    expect(result.dueAt.getTime()).toBeGreaterThan(NOW.getTime() + days(0));
  });

  it("Good on a New card → Review, due in ~2 days (stability ≈ W[2]=2.31)", () => {
    const result = schedule(newCard(), Rating.Good, NOW);
    expect(result.state).toBe(State.Review);
    expect(result.reps).toBe(1);
    expect(result.scheduledDays).toBeGreaterThanOrEqual(2);
    expect(result.scheduledDays).toBeLessThanOrEqual(3);
    expect(result.dueAt.getTime()).toBe(NOW.getTime() + days(result.scheduledDays));
  });

  it("Easy on a New card → Review, due in ~8 days (stability ≈ W[3]=8.30)", () => {
    const result = schedule(newCard(), Rating.Easy, NOW);
    expect(result.state).toBe(State.Review);
    expect(result.reps).toBe(1);
    expect(result.scheduledDays).toBeGreaterThanOrEqual(8);
    expect(result.scheduledDays).toBeLessThanOrEqual(9);
  });

  it("initial difficulty reflects the rating (harder rating → higher difficulty)", () => {
    const again = schedule(newCard(), Rating.Again, NOW);
    const easy = schedule(newCard(), Rating.Easy, NOW);
    expect(again.difficulty).toBeGreaterThan(easy.difficulty);
  });
});

describe("FSRS-6 schedule — Review card (recall)", () => {
  function reviewCard(overrides: Partial<CardState> = {}): CardState {
    return newCard({
      stability: 10,
      difficulty: 5,
      scheduledDays: 10,
      reps: 3,
      state: State.Review,
      lastReviewedAt: new Date(NOW.getTime() - days(10)),
      ...overrides,
    });
  }

  it("Good on Review → Review with longer interval", () => {
    const result = schedule(reviewCard(), Rating.Good, NOW);
    expect(result.state).toBe(State.Review);
    expect(result.reps).toBe(4);
    expect(result.scheduledDays).toBeGreaterThan(10); // interval grows
  });

  it("Easy on Review → longer interval than Good (easy bonus)", () => {
    const good = schedule(reviewCard(), Rating.Good, NOW);
    const easy = schedule(reviewCard(), Rating.Easy, NOW);
    expect(easy.scheduledDays).toBeGreaterThan(good.scheduledDays);
    expect(easy.stability).toBeGreaterThan(good.stability);
  });

  it("Hard on Review → shorter interval than Good (hard penalty)", () => {
    const hard = schedule(reviewCard(), Rating.Hard, NOW);
    const good = schedule(reviewCard(), Rating.Good, NOW);
    expect(hard.scheduledDays).toBeLessThan(good.scheduledDays);
    expect(hard.stability).toBeLessThan(good.stability);
  });

  it("Again on Review → Relearning, lapse count increments, short interval", () => {
    const result = schedule(reviewCard({ lapses: 2 }), Rating.Again, NOW);
    expect(result.state).toBe(State.Relearning);
    expect(result.lapses).toBe(3);
    expect(result.reps).toBe(0);
    expect(result.dueAt.getTime()).toBeLessThan(NOW.getTime() + days(1));
  });

  it("stability after lapse is less than prior stability", () => {
    const card = reviewCard({ stability: 20 });
    const result = schedule(card, Rating.Again, NOW);
    expect(result.stability).toBeLessThan(card.stability);
    expect(result.stability).toBeGreaterThan(0);
  });
});

describe("FSRS-6 schedule — Relearning card", () => {
  function relearningCard(overrides: Partial<CardState> = {}): CardState {
    return newCard({
      stability: 2,
      difficulty: 6,
      scheduledDays: 0,
      reps: 2,
      lapses: 1,
      state: State.Relearning,
      lastReviewedAt: new Date(NOW.getTime() - minutes(10)),
      ...overrides,
    });
  }

  it("Good on Relearning → graduates to Review", () => {
    const result = schedule(relearningCard(), Rating.Good, NOW);
    expect(result.state).toBe(State.Review);
    expect(result.reps).toBe(3);
    expect(result.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it("Easy on Relearning → graduates to Review", () => {
    const result = schedule(relearningCard(), Rating.Easy, NOW);
    expect(result.state).toBe(State.Review);
  });

  it("Again on Relearning → stays in Relearning, lapses increment", () => {
    const result = schedule(relearningCard({ lapses: 1 }), Rating.Again, NOW);
    expect(result.state).toBe(State.Relearning);
    expect(result.lapses).toBe(2);
    expect(result.dueAt.getTime()).toBe(NOW.getTime() + minutes(5));
  });

  it("Hard on Relearning → stays in Relearning, due in 10 minutes", () => {
    const result = schedule(relearningCard(), Rating.Hard, NOW);
    expect(result.state).toBe(State.Relearning);
    expect(result.dueAt.getTime()).toBe(NOW.getTime() + minutes(10));
  });
});

describe("FSRS-6 memory model invariants", () => {
  it("stability is always > 0 after any schedule call", () => {
    const card = newCard();
    for (const rating of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const) {
      const result = schedule(card, rating, NOW);
      expect(result.stability).toBeGreaterThan(0);
    }
  });

  it("difficulty stays in [1, 10] across repeated grading", () => {
    let card = newCard();
    let result = schedule(card, Rating.Good, NOW);
    for (let i = 0; i < 20; i++) {
      card = {
        ...card,
        stability: result.stability,
        difficulty: result.difficulty,
        state: result.state,
        reps: result.reps,
        lapses: result.lapses,
        scheduledDays: result.scheduledDays,
        lastReviewedAt: NOW,
      };
      result = schedule(card, Rating.Again, NOW);
      expect(result.difficulty).toBeGreaterThanOrEqual(1);
      expect(result.difficulty).toBeLessThanOrEqual(10);
    }
  });

  it("scheduledDays is >= 1 when state transitions to Review", () => {
    const result = schedule(newCard(), Rating.Good, NOW);
    expect(result.state).toBe(State.Review);
    expect(result.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it("dueAt is consistent with scheduledDays for Review cards", () => {
    const result = schedule(newCard(), Rating.Good, NOW);
    const expectedDue = NOW.getTime() + result.scheduledDays * 86_400_000;
    expect(result.dueAt.getTime()).toBe(expectedDue);
  });

  it("Again raises difficulty, Easy lowers it", () => {
    const reviewCard: CardState = {
      stability: 10,
      difficulty: 5.0,
      scheduledDays: 10,
      reps: 3,
      lapses: 0,
      state: State.Review,
      lastReviewedAt: new Date(NOW.getTime() - 10 * 86_400_000),
    };
    const afterAgain = schedule(reviewCard, Rating.Again, NOW);
    expect(afterAgain.difficulty).toBeGreaterThan(5.0);

    const afterHard = schedule(reviewCard, Rating.Hard, NOW);
    expect(afterHard.difficulty).toBeGreaterThan(5.0);

    const afterEasy = schedule(reviewCard, Rating.Easy, NOW);
    expect(afterEasy.difficulty).toBeLessThan(5.0);
  });
});

describe("FSRS-6 difficulty update", () => {
  const reviewCard: CardState = {
    stability: 10,
    difficulty: 5.0,
    scheduledDays: 10,
    reps: 3,
    lapses: 0,
    state: State.Review,
    lastReviewedAt: new Date(NOW.getTime() - 10 * 86_400_000),
  };

  it("Good leaves difficulty almost unchanged", () => {
    // delta = -w6 * (3 - 3) = 0, so only the tiny w7 = 0.001 mean reversion
    // toward D_0(Easy) moves it: 0.001 * D_0(Easy) + 0.999 * 5 ≈ 4.990.
    const result = schedule(reviewCard, Rating.Good, NOW);
    expect(result.difficulty).toBeCloseTo(4.99, 2);
  });

  it("Again adds a damped step of w6 per grade below Good", () => {
    // 5 + 3.0194 * 2 * (10 - 5) / 9 = 8.355, then the w7 mean reversion ≈ 8.342.
    const result = schedule(reviewCard, Rating.Again, NOW);
    expect(result.difficulty).toBeCloseTo(8.342, 2);
  });
});

describe("retrievability", () => {
  it("returns 0.9 exactly when elapsed == stability", () => {
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 5);
  });

  it("returns 1.0 at elapsed = 0", () => {
    expect(retrievability(0, 10)).toBeCloseTo(1.0, 5);
  });

  it("decays below 0.9 past the stability boundary", () => {
    expect(retrievability(20, 10)).toBeLessThan(0.9);
  });

  it("returns 0 for non-positive stability", () => {
    expect(retrievability(5, 0)).toBe(0);
    expect(retrievability(5, -1)).toBe(0);
  });
});

describe("FSRS-6 short-term stability", () => {
  const relearning: CardState = {
    stability: 10,
    difficulty: 6,
    scheduledDays: 0,
    reps: 2,
    lapses: 1,
    state: State.Relearning,
    lastReviewedAt: new Date(NOW.getTime() - 10 * 60_000),
  };

  it("Good never lowers stability (reference keeps 10)", () => {
    // Raw factor 10^-w19 * e^(w17 * w18) ≈ 0.90; the reference floors it at 1.
    const result = schedule(relearning, Rating.Good, NOW);
    expect(result.stability).toBeCloseTo(10, 6);
  });

  it("Hard never lowers stability either", () => {
    const result = schedule({ ...relearning, stability: 2 }, Rating.Hard, NOW);
    expect(result.stability).toBeCloseTo(2, 6);
  });

  it("Again can still lower it", () => {
    const result = schedule(relearning, Rating.Again, NOW);
    expect(result.stability).toBeLessThan(10);
  });
});
