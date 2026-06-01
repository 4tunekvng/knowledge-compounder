import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudyDeck } from "@/components/StudyDeck";
import { getDeckByToken } from "@/lib/services/decks";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const deck = await getDeckByToken(token);
  if (!deck) return { title: "Deck not found · Knowledge Compounder" };
  return {
    title: `${deck.deck.title} · Study deck`,
    description:
      deck.deck.description ?? `A ${deck.cards.length}-card flashcard deck to study.`,
  };
}

export default async function StudentDeckPage({ params }: Params) {
  const { token } = await params;
  const deck = await getDeckByToken(token);
  if (!deck) notFound();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wider text-[color:var(--accent)]">
          Shared study deck
        </p>
        <h1 className="font-serif text-3xl md:text-4xl tracking-tight" data-testid="deck-title">
          {deck.deck.title}
        </h1>
        {deck.deck.description && (
          <p className="text-[color:var(--muted)] max-w-2xl">{deck.deck.description}</p>
        )}
        <p className="text-sm text-[color:var(--muted)]">
          {deck.cards.length} {deck.cards.length === 1 ? "card" : "cards"} ·{" "}
          {deck.sourceTitles.length}{" "}
          {deck.sourceTitles.length === 1 ? "source" : "sources"}
        </p>
      </header>

      <StudyDeck
        title={deck.deck.title}
        cards={deck.cards.map((c) => ({
          id: c.id,
          cardType: c.cardType,
          front: c.front,
          back: c.back,
          sourceTitle: c.sourceTitle,
        }))}
        exportBase={`/d/${token}`}
      />
    </div>
  );
}
