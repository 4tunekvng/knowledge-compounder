// FSRS-6 Spaced Repetition Algorithm.
//
// Upgraded from FSRS-5. FSRS-6 (released late 2025, trained on 700M+ reviews)
// adds two new parameters: w[19] (same-day stability power factor) and w[20]
// (per-user optimizable forgetting curve shape), reducing reviews ~20-30%
// vs SM-2 at matched 90% retention.
// Reference: https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler
//
// State machine:
//   New  → Again → Relearning | Hard/Good/Easy → Review
//   Review → Again → Relearning | Hard/Good/Easy → Review (longer interval)
//   Relearning → Again/Hard → Relearning | Good/Easy → Review

// Rating enum mirrors FSRS convention (1-indexed so W[rating-1] is unambiguous).
export type Rating = 1 | 2 | 3 | 4;
export const Rating = {
  Again: 1 as Rating,
  Hard: 2 as Rating,
  Good: 3 as Rating,
  Easy: 4 as Rating,
} as const;

export type State = 0 | 1 | 2 | 3;
export const State = {
  New: 0 as State,
  Learning: 1 as State,
  Review: 2 as State,
  Relearning: 3 as State,
} as const;

// Default FSRS-6 weights, trained on the open-spaced-repetition community dataset.
// These may be personalised per-user in a future version via the optimizer.
const W = [
  0.212,  1.2931, 2.3065, 8.2956, // w0-w3: initial stability per rating
  6.4133, 0.8334,                  // w4-w5: initial difficulty formula
  3.0194, 0.001,                   // w6-w7: difficulty update
  1.8722, 0.1666, 0.796,           // w8-w10: stability after recall
  1.4835, 0.0614, 0.2629, 1.6483,  // w11-w14: stability after lapse
  0.6014, 1.8729,                  // w15-w16: hard/easy modifiers
  0.5425, 0.0912,                  // w17-w18: short-term stability base
  0.0658,                          // w19: same-day stability power (new in FSRS-6)
  0.1542,                          // w20: forgetting curve decay (new in FSRS-6)
] as const;

// Power-law forgetting curve: R(t, S) = (1 + FACTOR * t/S)^DECAY
// FSRS-6: DECAY = -w[20] (was fixed -0.5); FACTOR derived so R(S, S) = 0.9.
const DECAY = -W[20];
const FACTOR = Math.pow(0.9, 1.0 / DECAY) - 1;

export interface CardState {
  // Stored in the "ease" SQL column for backward-compatible schema.
  stability: number;
  // Stored in the "difficulty" SQL column.
  difficulty: number;
  // Stored in the "interval_days" SQL column.
  scheduledDays: number;
  // Stored in the "repetitions" SQL column.
  reps: number;
  // Stored in the "lapses" SQL column.
  lapses: number;
  // Stored in the "fsrs_state" SQL column (0=New,1=Learning,2=Review,3=Relearning).
  state: State;
  lastReviewedAt: Date | null;
}

export interface ScheduleResult {
  stability: number;
  difficulty: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: State;
  dueAt: Date;
}

function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + FACTOR * (elapsedDays / stability), DECAY);
}

function initialStability(rating: Rating): number {
  return Math.max(0.1, W[rating - 1]);
}

// D_0(G) = W[4] − exp(W[5] × (G−1)) + 1
function initialDifficulty(rating: Rating): number {
  return clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, 1, 10);
}

// D' = W[6] × D_0(G) + (1 − W[6]) × (D − W[7] × (G−3))
// Mean-reversion target is D_0 of the *current* rating, not always D_0(Easy).
function nextDifficulty(d: number, rating: Rating): number {
  const d0 = initialDifficulty(rating);
  return clamp(W[6] * d0 + (1 - W[6]) * (d - W[7] * (rating - 3)), 1, 10);
}

// S_r (stability after successful review in Review state)
function stabilityAfterRecall(d: number, s: number, r: number, rating: Rating): number {
  const hardPenalty = rating === Rating.Hard ? W[15] : 1;
  const easyBonus = rating === Rating.Easy ? W[16] : 1;
  return Math.max(
    0.1,
    s *
      (Math.exp(W[8]) *
        (11 - d) *
        Math.pow(s, -W[9]) *
        (Math.exp(W[10] * (1 - r)) - 1) *
        hardPenalty *
        easyBonus +
        1),
  );
}

// S_f (stability after forgetting — used when Again is graded in Review)
function stabilityAfterLapse(d: number, s: number, r: number): number {
  return Math.max(
    0.1,
    W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)),
  );
}

// S_s (short-term stability update for Learning/Relearning same-session reviews)
// FSRS-6 adds Math.pow(s, -W[19]): cards with high stability get a smaller boost
// from same-day re-reviews, matching empirical memory dynamics.
function shortTermStability(s: number, rating: Rating): number {
  return Math.max(0.1, s * Math.exp(W[17] * (rating - 3 + W[18])) * Math.pow(s, -W[19]));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const MINUTES = 60_000;
const DAYS = 86_400_000;

export function schedule(card: CardState, rating: Rating, now: Date = new Date()): ScheduleResult {
  const elapsedDays = card.lastReviewedAt
    ? (now.getTime() - card.lastReviewedAt.getTime()) / DAYS
    : 0;

  if (card.state === State.New) {
    return scheduleNew(card, rating, now);
  } else if (card.state === State.Review) {
    return scheduleReview(card, rating, elapsedDays, now);
  } else {
    // Learning or Relearning
    return scheduleRelearning(card, rating, now);
  }
}

function scheduleNew(card: CardState, rating: Rating, now: Date): ScheduleResult {
  const s = initialStability(rating);
  const d = initialDifficulty(rating);

  if (rating === Rating.Again) {
    return {
      stability: s,
      difficulty: d,
      scheduledDays: 0,
      reps: 0,
      lapses: card.lapses,
      state: State.Relearning,
      dueAt: new Date(now.getTime() + 5 * MINUTES),
    };
  }

  // Hard / Good / Easy: graduate immediately to Review.
  // New cards come from material the user already read, so skip the Learning
  // intermediate phase and schedule directly by stability.
  const days = Math.max(1, Math.round(s));
  return {
    stability: s,
    difficulty: d,
    scheduledDays: days,
    reps: 1,
    lapses: card.lapses,
    state: State.Review,
    dueAt: new Date(now.getTime() + days * DAYS),
  };
}

function scheduleReview(
  card: CardState,
  rating: Rating,
  elapsedDays: number,
  now: Date,
): ScheduleResult {
  const r = retrievability(elapsedDays, card.stability);
  const d = nextDifficulty(card.difficulty, rating);

  if (rating === Rating.Again) {
    const s = stabilityAfterLapse(card.difficulty, card.stability, r);
    return {
      stability: s,
      difficulty: d,
      scheduledDays: 0,
      reps: 0,
      lapses: card.lapses + 1,
      state: State.Relearning,
      dueAt: new Date(now.getTime() + 10 * MINUTES),
    };
  }

  const s = stabilityAfterRecall(card.difficulty, card.stability, r, rating);
  const days = Math.max(1, Math.round(s));
  return {
    stability: s,
    difficulty: d,
    scheduledDays: days,
    reps: card.reps + 1,
    lapses: card.lapses,
    state: State.Review,
    dueAt: new Date(now.getTime() + days * DAYS),
  };
}

function scheduleRelearning(card: CardState, rating: Rating, now: Date): ScheduleResult {
  const s = shortTermStability(card.stability, rating);
  const d = nextDifficulty(card.difficulty, rating);

  if (rating === Rating.Again) {
    return {
      stability: s,
      difficulty: d,
      scheduledDays: 0,
      reps: card.reps,
      lapses: card.lapses + 1,
      state: State.Relearning,
      dueAt: new Date(now.getTime() + 5 * MINUTES),
    };
  }

  if (rating === Rating.Hard) {
    return {
      stability: s,
      difficulty: d,
      scheduledDays: 0,
      reps: card.reps,
      lapses: card.lapses,
      state: State.Relearning,
      dueAt: new Date(now.getTime() + 10 * MINUTES),
    };
  }

  // Good or Easy: graduate back to Review.
  const days = Math.max(1, Math.round(s));
  return {
    stability: s,
    difficulty: d,
    scheduledDays: days,
    reps: card.reps + 1,
    lapses: card.lapses,
    state: State.Review,
    dueAt: new Date(now.getTime() + days * DAYS),
  };
}
