import Link from "next/link";
import { CaptureForm } from "@/components/CaptureForm";
import { SourceListItem } from "@/components/SourceListItem";
import { listSources } from "@/lib/services/queries";
import { requireUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const recent = await listSources(user.id, 5);

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
      <section className="min-w-0">
        <h1 className="text-title font-medium">Capture something you just read</h1>
        <p className="mt-3 mb-8 max-w-[36rem] text-read text-ink-2">
          Paste a link or your own notes, or add a PDF. You get a 100-word note
          on why it mattered to you, a set of flashcards and its main ideas,
          filed in your library.
        </p>
        <CaptureForm />
      </section>

      <section className="min-w-0 lg:pt-3">
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <h2 className="section-title">Recent captures</h2>
          {recent.length > 0 && (
            <Link href="/library" className="text-ui text-ink-2">
              Library
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <div
            className="border-t border-line pt-4 text-ui text-ink-2"
            data-testid="empty-state"
          >
            <p>Nothing filed yet.</p>
            <p className="mt-2 text-ink-3">
              Your first capture lands here. Its flashcards are ready to review
              as soon as it is filed.
            </p>
          </div>
        ) : (
          <ul data-testid="recent-sources-list">
            {recent.map(({ source, processing, cardCount }) => (
              <SourceListItem
                key={source.id}
                source={source}
                whyICared={processing?.whyICared ?? null}
                conceptsJson={processing?.concepts ?? null}
                cardCount={cardCount}
                compact
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
