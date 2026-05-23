import { ReviewQueue } from "@/components/ReviewQueue";
import { listDueCards } from "@/lib/services/queries";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const due = await listDueCards();
  const cards = due.map(({ card, source }) => ({
    id: card.id,
    cardType: card.cardType,
    front: card.front,
    back: card.back,
    source,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">Review</h1>
        <p className="text-[color:var(--muted)] mt-1">
          {cards.length} {cards.length === 1 ? "card" : "cards"} due now.
        </p>
      </div>
      <ReviewQueue cards={cards} />
    </div>
  );
}
