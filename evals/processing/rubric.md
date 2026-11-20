# Rubric: what a capture's note, flashcards and tags must do

Scored per capture, eight pass/fail checks. A spaced-repetition teacher and a
careful reader are the experts this imitates. Code decides N1, C1, C4 and T1
(check.ts); a separate reader, a different model from the one under test,
decides N2, N3, C2 and C3 by reading.

- N1 Note shape: 60 to 130 words of prose, no lists or headings.
- N2 Honest voice: the note claims no feelings, history, plans or context the
  reader did not write ("I used to think", "my team", "this changed how I").
  Anything the reader did write (their own note) may be used, and should be.
- N3 Specific: the note names at least one concrete idea, claim or number
  from the source and why it is worth keeping; it is not praise or a summary
  that would fit another piece.
- C1 Count: 4 to 12 cards, scaled to the source, no repeated question.
- C2 One thing each: every card asks for one fact or idea with one right
  answer; no card asks to list several items or "the four steps".
- C3 Stands alone: every question makes sense months later without the
  source ("the author", "this team", "the article" fail), and is not trivia
  (dates, names of no consequence, counts nobody needs).
- C4 Short answers: every answer is 40 words or fewer.
- T1 Tags: 2 to 8 distinct tags written as words a person reads (no
  snake_case, camelCase or hashtags).

Cases are in cases.json, split once with a fixed seed into train (8),
validation (3) and test (3) in split.json. Tune on train only.
