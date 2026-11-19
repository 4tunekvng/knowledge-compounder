import { catalogNumber } from "@/lib/format";

// A capture's number in a column of its own: one width, right-aligned, so the
// titles beside it line up down the list.
export function CatalogNo({ id }: { id: number }) {
  return (
    <span className="w-14 shrink-0 text-right text-meta text-ink-3 tabular-nums">
      {catalogNumber(id)}
    </span>
  );
}
