import { describe, it, expect } from "vitest";
import { schedule, Rating, State, type CardState } from "@/lib/sm2";

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

describe("FSRS-5 schedule — New card", () => {
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

  it("Good on a New card → Review, due in ~3 days (stability ≈ W[2]=3.13)", () => {
    const result = schedule(newCard(), Rating.Good, NOW);
    expect(result.state).toBe(State.Review);
    expect(result.reps).toBe(1);
    expect(result.scheduledDays).toBeGreaterThanOrEqual(3);
    expect(result.scheduledDays).toBeLessThanOrEqual(4);
    expect(result.dueAt.getTime()).toBe(NOW.getTime() + days(result.scheduledDays));
  });

  it("Easy on a New card → Review, due in ~15 days (stability ≈ W[3]=15.47)", () => {
    const result = schedule(newCard(), Rating.Easy, NOW);
    expect(result.state).toBe(State.Review);
    expect(result.reps).toBe(1);
    expect(result.scheduledDays).toBeGreaterThanOrEqual(15);
    expect(result.scheduledDays).toBeLessThanOrEqual(16);
  });

  it("initial difficulty reflects the rating (harder rating → higher difficulty)", () => {
    const again = schedule(newCard(), Rating.Again, NOW);
    const easy = schedule(newCard(), Rating.Easy, NOW);
    expect(again.difficulty).toBeGreaterThan(easy.difficulty);
  });
});

describe("FSRS-5 schedule — Review card (recall)", () => {
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

describe("FSRS-5 schedule — Relearning card", () => {
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

describe("FSRS-5 memory model invariants", () => {
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

  it("nextDifficulty mean-reverts toward D_0 of the given rating, not always D_0(Easy)", () => {
    // D_0(Again) ≈ 7.21, D_0(Easy) ≈ 3.29. For a card at d=5.0, 'Again' should
    // pull difficulty UP (toward 7.21) while 'Easy' should pull it DOWN (toward 3.29).
    // The bug used D_0(Easy) for all ratings, making 'Again' also pull difficulty down.
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
