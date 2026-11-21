import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudyDeck } from "@/components/StudyDeck";
import { getDeckByToken } from "@/lib/services/decks";
import { countLabel } from "@/lib/format";

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
    <div className="mx-auto flex max-w-[760px] flex-col gap-8">
      <header>
        <p className="text-meta text-ink-3">Study deck</p>
        <h1 className="mt-2 text-title font-medium" data-testid="deck-title">
          {deck.deck.title}
        </h1>
        {deck.deck.description && (
          <p className="mt-3 text-ui text-ink-2">{deck.deck.description}</p>
        )}
        <p className="mt-3 text-ui text-ink-3">
          {countLabel(deck.cards.length, "card")} from{" "}
          {countLabel(deck.sourceTitles.length, "capture")}
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
