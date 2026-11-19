"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu, type Account } from "./AccountMenu";
import {
  Import,
  Layers,
  Library,
  Network,
  PenLine,
  Share2,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  id: string;
  icon: LucideIcon;
  // Detail pages that belong to this section.
  owns?: string[];
}

const NAV: NavItem[] = [
  { href: "/", label: "Capture", id: "capture", icon: PenLine },
  {
    href: "/library",
    label: "Library",
    id: "library",
    icon: Library,
    owns: ["/sources/"],
  },
  { href: "/review", label: "Review", id: "review", icon: Layers },
  {
    href: "/themes",
    label: "Themes",
    id: "themes",
    icon: Network,
    owns: ["/essays/"],
  },
  { href: "/decks", label: "Decks", id: "decks", icon: Share2 },
  { href: "/integrations", label: "Imports", id: "integrations", icon: Import },
];

function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return (
    pathname.startsWith(item.href) ||
    (item.owns ?? []).some((prefix) => pathname.startsWith(prefix))
  );
}

const Wordmark = () => <>Knowledge Compounder</>;

export function SiteHeader({
  dueCount,
  account,
}: {
  dueCount: number;
  account: Account | null;
}) {
  const pathname = usePathname() ?? "/";
  // Public student deck pages (/d/<token>) and the sign-in page get the
  // wordmark alone, with no links into the owner's tools.
  const isPublic = pathname.startsWith("/d/") || pathname === "/login";

  if (isPublic || !account) {
    return (
      <header className="border-b border-line">
        <div
          className={
            "mx-auto flex h-14 max-w-[1120px] items-center px-4 sm:h-16 sm:px-8"
          }
        >
          <span className="text-ui font-semibold">
            <Wordmark />
          </span>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-line">
      <div
        className={
          "mx-auto flex h-14 max-w-[1120px] items-center gap-6 " +
          "px-4 sm:h-16 sm:px-8"
        }
      >
        <Link
          href="/"
          className="shrink-0 text-ui font-semibold text-ink no-underline"
          data-testid="brand-link"
        >
          <Wordmark />
        </Link>
        {/* One menu. On a phone it is a bar along the bottom edge, in thumb
            reach; from 640px up it sits in the header, before the account. */}
        <nav
          aria-label="Main"
          data-tabbar
          className={
            "fixed inset-x-0 bottom-0 z-10 border-t border-line bg-stock " +
            "pb-[env(safe-area-inset-bottom)] " +
            "sm:static sm:ml-auto sm:border-0 sm:bg-transparent sm:pb-0"
          }
        >
          <ul className="grid grid-cols-6 sm:flex sm:items-center sm:gap-1">
            {NAV.map((item) => {
              const active = isActive(item, pathname);
              const Icon = item.icon;
              const showDue = item.id === "review" && dueCount > 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    data-testid={`nav-${item.id}`}
                    className={
                      "relative flex h-16 flex-col items-center justify-center " +
                      "gap-1 text-label no-underline transition-colors " +
                      "sm:h-9 sm:flex-row sm:gap-2 sm:rounded-lg sm:px-3 " +
                      "sm:text-meta " +
                      (active
                        ? "font-medium text-ink sm:bg-raised"
                        : "text-ink-3 hover:text-ink sm:text-ink-2 " +
                          "sm:hover:bg-raised")
                    }
                  >
                    <Icon
                      aria-hidden
                      size={20}
                      strokeWidth={1.5}
                      className="sm:hidden"
                    />
                    {item.label}
                    {showDue && (
                      <span
                        className={
                          "absolute right-2 top-2 text-label text-accent " +
                          "sm:static"
                        }
                        data-testid="review-due-badge"
                        aria-label={`${dueCount} cards due for review`}
                      >
                        {dueCount > 99 ? "99+" : dueCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <AccountMenu account={account} className="ml-auto sm:ml-0" />
      </div>
    </header>
  );
}
