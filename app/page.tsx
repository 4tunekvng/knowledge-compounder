import { CaptureWorkspace } from "@/components/CaptureWorkspace";
import { SourceListItem } from "@/components/SourceListItem";
import { listSources } from "@/lib/services/queries";
import { requireUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const recent = await listSources(user.id, 5);

  return (
    <CaptureWorkspace
      hasRecent={recent.length > 0}
      recent={
        recent.length === 0 ? (
          <div
            className="border-t border-line pt-4 text-ui text-ink-2"
            data-testid="empty-state"
          >
            <p>Nothing filed yet.</p>
            <p className="mt-2 text-meta text-ink-3">
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
        )
      }
    />
  );
}
