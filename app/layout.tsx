import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { countDueCards } from "@/lib/services/queries";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Knowledge Compounder",
  description:
    "Capture what you read. Compound it into spaced reviews, cross-links, themes, and drafted essays.",
};

const NAV = [
  { href: "/", label: "Capture" },
  { href: "/library", label: "Library" },
  { href: "/review", label: "Review" },
  { href: "/themes", label: "Themes" },
];

// Layout is a server component; D1 access is async.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  let dueCount = 0;
  try {
    dueCount = await countDueCards();
  } catch {
    // DB may not be ready (first boot, in tests) — silently degrade.
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-[color:var(--border)] bg-[color:var(--background)]">
          <div className="max-w-5xl mx-auto px-6 py-5 flex items-baseline justify-between">
            <Link
              href="/"
              className="font-serif text-xl tracking-tight text-[color:var(--foreground)] no-underline"
              data-testid="brand-link"
            >
              Knowledge <span className="italic text-[color:var(--accent)]">Compounder</span>
            </Link>
            <nav className="flex gap-6 text-sm items-baseline">
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
        <main className="flex-1">
          <div className="max-w-5xl mx-auto px-6 py-10">{children}</div>
        </main>
        <footer className="border-t border-[color:var(--border)] py-6 text-center text-xs text-[color:var(--muted)]">
          A memory + synthesis OS for readers, learners, writers.
        </footer>
      </body>
    </html>
  );
}
