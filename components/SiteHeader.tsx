"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Capture" },
  { href: "/library", label: "Library" },
  { href: "/review", label: "Review" },
  { href: "/themes", label: "Themes" },
  { href: "/decks", label: "Decks" },
  { href: "/integrations", label: "Integrations" },
];

const Wordmark = () => (
  <>
    Knowledge <span className="italic text-[color:var(--accent)]">Compounder</span>
  </>
);

export function SiteHeader({ dueCount }: { dueCount: number }) {
  const pathname = usePathname();
  // Public student deck pages (/d/<token>) get a chrome-free wordmark — no
  // links into the owner's tools.
  const isStudent = pathname?.startsWith("/d/") ?? false;

  if (isStudent) {
    return (
      <header className="border-b border-[color:var(--border)] bg-[color:var(--background)]">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <span className="font-serif text-lg tracking-tight text-[color:var(--foreground)]">
            <Wordmark />
          </span>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-[color:var(--border)] bg-[color:var(--background)]">
      <div className="max-w-5xl mx-auto px-6 py-5 flex items-baseline justify-between gap-4">
        <Link
          href="/"
          className="font-serif text-xl tracking-tight text-[color:var(--foreground)] no-underline shrink-0"
          data-testid="brand-link"
        >
          <Wordmark />
        </Link>
        <nav className="flex flex-wrap gap-x-6 gap-y-1 text-sm items-baseline justify-end">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[color:var(--foreground)] no-underline hover:text-[color:var(--accent)] inline-flex items-center gap-1.5"
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              {item.label}
              {item.label === "Review" && dueCount > 0 && (
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold"
                  style={{
                    background: "var(--accent)",
                    color: "var(--background)",
                  }}
                  data-testid="review-due-badge"
                  aria-label={`${dueCount} cards due for review`}
                >
                  {dueCount > 99 ? "99+" : dueCount}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
