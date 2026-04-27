import { CaptureForm } from "@/components/CaptureForm";
import { SourceListItem } from "@/components/SourceListItem";
import { listSources } from "@/lib/services/queries";

export const dynamic = "force-dynamic";

export default function Home() {
  const recent = listSources(5);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="font-serif text-3xl tracking-tight mb-2">
          Capture something you just read
        </h1>
        <p className="text-[color:var(--muted)] mb-6 max-w-2xl">
          The agent will extract the content, write a 100-word reflection in your voice,
          generate three flashcards, tag concepts, and add it to your corpus.
        </p>
        <CaptureForm />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-xl">Recent captures</h2>
          {recent.length > 0 && (
            <a href="/library" className="text-sm">
              View library →
            </a>
          )}
        </div>
        {recent.length === 0 ? (
          <div
            className="border border-dashed border-[color:var(--border)] rounded-md p-8 text-center text-[color:var(--muted)]"
            data-testid="empty-state"
          >
            Your corpus is empty. Capture your first piece above.
          </div>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="recent-sources-list">
            {recent.map(({ source, processing, cardCount }) => (
              <SourceListItem
                key={source.id}
                source={source}
                whyICared={processing?.whyICared ?? null}
                conceptsJson={processing?.concepts ?? null}
                cardCount={cardCount}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
