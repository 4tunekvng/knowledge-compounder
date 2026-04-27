// SuperMemo 2 (SM-2) spaced-repetition algorithm.
//
// Grades:
//   0 = blackout (couldn't recall at all)
//   1 = wrong, but on remembering felt familiar
//   2 = wrong, but answer felt easy once shown
//   3 = correct, but with serious difficulty
//   4 = correct, with hesitation
//   5 = perfect recall
//
// Grade < 3 resets the repetition count and schedules for ~10 minutes from now.
// Grade >= 3 advances repetition: 1 day, 6 days, then ease-multiplied intervals.

export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

export interface CardSchedule {
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueAt: Date;
}

export interface SchedulerInput {
  ease: number;
  intervalDays: number;
  repetitions: number;
  grade: Grade;
  now?: Date;
}

const MIN_EASE = 1.3;
const RELEARN_MINUTES = 10;

export function schedule({
  ease,
  intervalDays,
  repetitions,
  grade,
  now = new Date(),
}: SchedulerInput): CardSchedule {
  // Update ease before deciding on the interval — this is the standard SM-2
  // formulation. Ease floor at 1.3 keeps even bad cards on a sane cadence.
  const nextEase = Math.max(
    MIN_EASE,
    ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)),
  );

  if (grade < 3) {
    return {
      ease: nextEase,
      intervalDays: 0,
      repetitions: 0,
      dueAt: new Date(now.getTime() + RELEARN_MINUTES * 60_000),
    };
  }

  const nextRepetitions = repetitions + 1;
  let nextInterval: number;
  if (nextRepetitions === 1) {
    nextInterval = 1;
  } else if (nextRepetitions === 2) {
    nextInterval = 6;
  } else {
    nextInterval = Math.round(intervalDays * nextEase);
  }

  return {
    ease: nextEase,
    intervalDays: nextInterval,
    repetitions: nextRepetitions,
    dueAt: new Date(now.getTime() + nextInterval * 86_400_000),
  };
}
