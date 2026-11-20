// What a reader is told when something goes wrong. The raw error can name
// gateway hosts or carry provider error bodies, so it never reaches the page:
// it is sorted into one of a few plain explanations instead.

/** Why a capture failed before anything was filed, as its thrower names it. */
export type CaptureFailure =
  | "cannot-open"
  | "not-web-address"
  | "private-address"
  | "not-web-page"
  | "too-large"
  | "pdf-no-text";

const CAPTURE_ERRORS: Record<CaptureFailure, string> = {
  "cannot-open":
    "Couldn't open that link. Check the address or paste the text instead.",
  "not-web-address":
    "That doesn't look like a web address. Check it, or paste the text instead.",
  "private-address":
    "That link points to a private network address, so it can't be opened " +
    "from here. Paste the text instead.",
  "not-web-page":
    "That link isn't a web page. If it's a PDF, download it and use Add a PDF.",
  "too-large":
    "That page is too large to capture. Paste the part you read instead.",
  "pdf-no-text":
    "Couldn't read any text in that PDF. It may be scanned pages rather " +
    "than text. Paste the text instead.",
};

/** Plain copy for a capture that failed before anything was filed. */
export function captureErrorCopy(failure: CaptureFailure): string {
  return CAPTURE_ERRORS[failure];
}

const FAILURE_REASONS: [RegExp, string][] = [
  [
    /^Gave up after/,
    "It failed three times in a row while waiting in the background.",
  ],
  [
    /structured output|schema|validation|too_big|parse/i,
    "The note and flashcards came back in a shape the app couldn't file.",
  ],
  [
    /\b40[13]\b|unauthori[sz]ed|forbidden|api key|authentication/i,
    "The AI model turned the request down.",
  ],
  [
    /\b429\b|\b529\b|rate limit|overloaded/i,
    "The AI model was too busy to answer.",
  ],
  [
    /timeout|timed out|aborted/i,
    "The AI model took too long to answer.",
  ],
];

/** Why a capture's note and flashcards couldn't be written, in plain words. */
export function failureReason(errorMessage: string | null): string {
  const match = FAILURE_REASONS.find(([pattern]) =>
    pattern.test(errorMessage ?? ""),
  );
  return match
    ? match[1]
    : "Something went wrong while writing its note and flashcards.";
}
