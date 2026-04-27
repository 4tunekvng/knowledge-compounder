import { describe, it, expect } from "vitest";
import { schedule } from "@/lib/sm2";

const NOW = new Date("2026-04-27T12:00:00.000Z");

function days(n: number) {
  return n * 86_400_000;
}

describe("SM-2 schedule", () => {
  it("resets repetitions and reschedules in ~10 minutes when graded < 3", () => {
    const next = schedule({
      ease: 2.5,
      intervalDays: 6,
      repetitions: 2,
      grade: 1,
      now: NOW,
    });
    expect(next.repetitions).toBe(0);
    expect(next.intervalDays).toBe(0);
    expect(next.dueAt.getTime()).toBe(NOW.getTime() + 10 * 60_000);
  });

  it("schedules 1 day after the first successful repetition", () => {
    const next = schedule({
      ease: 2.5,
      intervalDays: 0,
      repetitions: 0,
      grade: 4,
      now: NOW,
    });
    expect(next.repetitions).toBe(1);
    expect(next.intervalDays).toBe(1);
    expect(next.dueAt.getTime()).toBe(NOW.getTime() + days(1));
  });

  it("schedules 6 days after the second successful repetition", () => {
    const next = schedule({
      ease: 2.5,
      intervalDays: 1,
      repetitions: 1,
      grade: 4,
      now: NOW,
    });
    expect(next.repetitions).toBe(2);
    expect(next.intervalDays).toBe(6);
  });

  it("multiplies interval by ease for repetitions >= 3", () => {
    const next = schedule({
      ease: 2.5,
      intervalDays: 6,
      repetitions: 2,
      grade: 5,
      now: NOW,
    });
    expect(next.repetitions).toBe(3);
    // ease bumps slightly; expect interval ~ round(6 * new_ease) ≈ 16
    expect(next.intervalDays).toBeGreaterThanOrEqual(15);
    expect(next.intervalDays).toBeLessThanOrEqual(17);
  });

  it("floors ease at 1.3 even after repeated bad grades", () => {
    let state = { ease: 2.5, intervalDays: 0, repetitions: 0 };
    for (let i = 0; i < 10; i++) {
      const next = schedule({
        ...state,
        grade: 0,
        now: NOW,
      });
      state = {
        ease: next.ease,
        intervalDays: next.intervalDays,
        repetitions: next.repetitions,
      };
    }
    expect(state.ease).toBeGreaterThanOrEqual(1.3);
    // confirm a single grade-0 alone doesn't push below the floor either
    const single = schedule({ ease: 1.3, intervalDays: 0, repetitions: 0, grade: 0, now: NOW });
    expect(single.ease).toBeGreaterThanOrEqual(1.3);
  });

  it("nudges ease upward on perfect recall", () => {
    const next = schedule({
      ease: 2.5,
      intervalDays: 6,
      repetitions: 2,
      grade: 5,
      now: NOW,
    });
    expect(next.ease).toBeGreaterThan(2.5);
  });
});
