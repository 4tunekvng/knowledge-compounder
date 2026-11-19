import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { headers } from "next/headers";
import { countDueCards } from "@/lib/services/queries";
import { currentUser } from "@/lib/auth/user";
import { signOutUrl } from "@/lib/auth/gate";

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

// Layout is a server component; D1 access is async.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  // Public pages (/login, /d/<token>) have no signed-in user.
  const user = await currentUser();
  let dueCount = 0;
  if (user) {
    try {
      dueCount = await countDueCards(user.id);
    } catch {
      // DB may not be ready (first boot, in tests) — silently degrade.
    }
  }
  const host = (await headers()).get("host") ?? "";
  const account = user
    ? {
        name: user.name,
        email: user.email,
        picture: user.picture,
        signOutUrl: signOutUrl(host),
      }
    : null;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader dueCount={dueCount} account={account} />
        <main className="flex-1 wrap-anywhere">
          <div className="max-w-5xl mx-auto px-6 py-10">{children}</div>
        </main>
        <footer className="border-t border-[color:var(--border)] py-6 text-center text-xs text-[color:var(--muted)]">
          A memory + synthesis OS for readers, learners, writers.
        </footer>
      </body>
    </html>
  );
}
