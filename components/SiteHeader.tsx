"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu, type Account } from "./AccountMenu";

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

export function SiteHeader({
  dueCount,
  account,
}: {
  dueCount: number;
  account: Account | null;
}) {
  const pathname = usePathname();
  // Public student deck pages (/d/<token>) and the sign-in page get a
  // chrome-free wordmark — no links into the owner's tools.
  const isPublic =
    !!pathname && (pathname.startsWith("/d/") || pathname === "/login");

  if (isPublic || !account) {
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
      <div
        className={
          "max-w-5xl mx-auto px-6 py-5 flex flex-col gap-3 " +
          "sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
        }
      >
        {/* Phone: wordmark and account share the top row. Wider: the row
            dissolves and the account sits after the menu. */}
        <div className="flex items-center justify-between gap-4 sm:contents">
          <Link
            href="/"
            className={
              "font-serif text-xl tracking-tight no-underline shrink-0 " +
              "text-[color:var(--foreground)]"
            }
            data-testid="brand-link"
          >
            <Wordmark />
          </Link>
          <AccountMenu account={account} className="sm:order-last" />
        </div>
        {/* One scrollable row on a phone; wraps to the right on wider screens. */}
        <nav
          className={
            "flex gap-x-6 gap-y-1 text-sm items-baseline whitespace-nowrap " +
            "overflow-x-auto sm:ml-auto sm:flex-wrap sm:justify-end " +
            "sm:overflow-visible"
          }
        >
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
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold"
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
