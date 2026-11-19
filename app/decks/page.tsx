import Link from "next/link";
import { headers } from "next/headers";
import { DeckManager } from "@/components/DeckManager";
import { listSources } from "@/lib/services/queries";
import { listDecks } from "@/lib/services/decks";
import { requireUser } from "@/lib/auth/user";
import { formatDay } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DecksPage() {
  const user = await requireUser();
  const [sourceItems, deckSummaries, headerList] = await Promise.all([
    listSources(user.id, 200),
    listDecks(user.id),
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
    madeOn: formatDay(d.deck.createdAt),
  }));

  return (
    <div className="flex flex-col gap-12">
      <div>
        <h1 className="text-title font-medium">Study decks</h1>
        <p className="mt-3 max-w-[40rem] text-ui text-ink-2">
          Share flashcards with students as one link. They need no account, and
          can study in the browser or download the cards as a PDF or an Anki
          deck.
        </p>
      </div>

      {sources.length === 0 ? (
        <div className="border-t border-line pt-6 text-ui text-ink-2">
          <p>Decks are made from flashcards, and there are none yet.</p>
          <p className="mt-2">
            <Link href="/">Capture something</Link> and its cards can go in a
            deck.
          </p>
        </div>
      ) : (
        <DeckManager sources={sources} decks={decks} origin={origin} />
      )}
    </div>
  );
}
