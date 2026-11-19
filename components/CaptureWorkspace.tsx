"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { CaptureForm } from "@/components/CaptureForm";
import { FilingCard } from "@/components/FilingCard";

// The capture page: the card you write on, and beside it the recent
// captures, where the one being filed appears on top while it is written.
export function CaptureWorkspace({
  hasRecent,
  recent,
}: {
  hasRecent: boolean;
  recent: ReactNode;
}) {
  const [filing, setFiling] = useState<string | null>(null);

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
      <section className="min-w-0">
        <h1 className="text-title font-medium">Capture something you just read</h1>
        <p className="mt-3 mb-8 max-w-[36rem] text-ui text-ink-2">
          Paste a link or your own notes, or add a PDF. You get a 100-word note
          on why it mattered to you, a set of flashcards and its main ideas,
          filed in your library.
        </p>
        <CaptureForm onFiling={setFiling} />
      </section>

      <section className="min-w-0 lg:pt-2">
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <h2 className="section-title">Recent captures</h2>
          {hasRecent && (
            <Link href="/library" className="text-meta text-ink-2">
              Library
            </Link>
          )}
        </div>
        {filing && (
          <FilingCard title={filing} className="mb-4 hidden lg:block" />
        )}
        {recent}
      </section>
    </div>
  );
}
