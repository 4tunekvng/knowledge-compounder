"use client";

import { useSyncExternalStore } from "react";

// The server runs on universal time, so a date it formats can be a day off
// for the reader, and React then rejects the page as not matching. A time
// shown to the reader is formatted in their browser only: null on the server
// and during hydration, the formatted text after.
const noChanges = () => () => {};

export function useLocalTime(format: () => string): string | null {
  return useSyncExternalStore(noChanges, format, () => null);
}
