# Grader instructions (for the judged checks)

You are a strict grader. Grade every record in the packet (built by
packet.ts) on these four checks, each pass or fail. Apply the same standard
to every record.

- N2 Honest voice: the note claims no feelings, personal history, plans,
  team or context the reader did not write. "I used to think", "my team",
  "this reframed how I look at", "I've been struggling to", "I keep running
  into" fail, unless the record is kind "text" (the reader's own notes) and
  the reader wrote it ("My note: ...", "Remember this for the rover
  project"); then the note may use exactly that. An invented emotional
  reaction ("is a massive relief", "the real magic") also fails.
- N3 Specific: the note names at least one concrete idea, claim or number
  from the source and why it is worth keeping. Generic praise, or a summary
  that could fit another piece, fails.
- C2 One thing each: every card asks for one fact or idea with one right
  answer. A card that asks to list several items ("What are the four
  steps...") or whose answer is a list of three or more separate items fails
  the record.
- C3 Stands alone: every card question makes sense months later without
  the source in front of you. Questions leaning on "the author", "the
  article", "this team", "the speaker", "the source", "in this context", or
  the reader's own project without saying what it is, fail. Pure trivia (a
  date, a name or a count nobody needs) fails.

Write a JSON array, one object per record:
{"id", "N2": bool, "N3": bool, "C2": bool, "C3": bool,
 "why": {"N2": "offending phrase or ''", "N3": "reason or ''",
         "C2": "offending question or ''", "C3": "offending question or ''"}}
