import { ReviewQueue } from "@/components/ReviewQueue";
import { countLabel } from "@/lib/format";
import { countDueCards, listDueCards } from "@/lib/services/queries";
import { nextDueIn } from "@/lib/services/review";
import { requireUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const user = await requireUser();
  const now = new Date();
  const [due, dueTotal] = await Promise.all([
    listDueCards(user.id, now),
    countDueCards(user.id, now),
  ]);
  const cards = due.map(({ card, source }) => ({
    id: card.id,
    cardType: card.cardType,
    front: card.front,
    back: card.back,
    source,
    // How long each grade would put the card away for, shown on its button.
    nextIn: nextDueIn(card, now),
  }));

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-8">
      <div>
        <h1 className="text-title font-medium">Review</h1>
        <p className="mt-3 text-read text-ink-2">
          {countLabel(dueTotal, "card")} due now
          {/* The queue loads at most a round of cards at a time. */}
          {dueTotal > cards.length && `, the first ${cards.length} in this round`}
        </p>
      </div>
      <ReviewQueue cards={cards} />
    </div>
  );
}
