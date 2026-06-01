import Link from "next/link";
import { headers } from "next/headers";
import { DeckManager } from "@/components/DeckManager";
import { listSources } from "@/lib/services/queries";
import { listDecks } from "@/lib/services/decks";

export const dynamic = "force-dynamic";

export default async function DecksPage() {
  const [sourceItems, deckSummaries, headerList] = await Promise.all([
    listSources(200),
    listDecks(),
    headers(),
  ]);

  // Build the absolute origin for shareable links server-side, so the deck
  // links are correct even before client JS runs.
  const host = headerList.get("host") ?? "localhost:3200";
  const proto =
    headerList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const origin = `${proto}://${host}`;

  // Only processed sources that actually have cards can go into a study deck.
  const sources = sourceItems
    .filter((s) => s.source.status === "processed" && s.cardCount > 0)
    .map((s) => ({
      id: s.source.id,
      title: s.source.title,
      cardCount: s.cardCount,
    }));

  const decks = deckSummaries.map((d) => ({
    id: d.deck.id,
    title: d.deck.title,
    description: d.deck.description,
    shareToken: d.deck.shareToken,
    sourceIds: d.sourceIds,
    cardCount: d.cardCount,
    createdAt: d.deck.createdAt.valueOf(),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">Study decks</h1>
        <p className="text-[color:var(--muted)] mt-1 max-w-2xl">
          Bundle the flashcards from any sources into a deck, then share one link.
          Students open it with no login and can study in the browser or download
          the cards as a PDF study guide or an Anki deck.
        </p>
      </div>

      {sources.length === 0 ? (
        <div className="border border-dashed border-[color:var(--border)] rounded-md p-8 text-center text-[color:var(--muted)]">
          You need at least one processed source with flashcards first.{" "}
          <Link href="/" className="text-[color:var(--accent)]">
            Capture something
          </Link>
          .
        </div>
      ) : (
        <DeckManager sources={sources} decks={decks} origin={origin} />
      )}
    </div>
  );
}
