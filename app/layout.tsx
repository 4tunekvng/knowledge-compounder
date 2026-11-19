import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Courier_Prime, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { headers } from "next/headers";
import { countDueCards } from "@/lib/services/queries";
import { currentUser } from "@/lib/auth/user";
import { signOutUrl } from "@/lib/auth/gate";

// A book serif for reading and the interface; a typewriter face for what is
// typed on the index cards, the way library catalogue cards were.
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  axes: ["opsz"],
});

const courierPrime = Courier_Prime({
  variable: "--font-courier-prime",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Knowledge Compounder",
  description:
    "Capture what you read. Each piece becomes flashcards you review, " +
    "links to what you read before, themes and drafted essays.",
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
      className={
        `${sourceSerif.variable} ${courierPrime.variable} h-full antialiased`
      }
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader dueCount={dueCount} account={account} />
        <main className="flex-1 wrap-anywhere">
          <div className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-8 sm:py-12">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
