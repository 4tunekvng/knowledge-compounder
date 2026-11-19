import type { Metadata } from "next";
import { headers } from "next/headers";
import { googleSignInUrl, safeNext } from "@/lib/auth/gate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · Knowledge Compounder",
};

// Colours name the redesign's tokens first and today's second, so the page
// reads right on either stylesheet.
const STOCK = "var(--stock, var(--card))";
const INK = "var(--ink, var(--foreground))";
const INK_2 = "var(--ink-2, var(--muted))";
const LINE = "var(--line, var(--border))";
const RULE = "var(--card-rule, #cbdae8)";
const HEAD_RULE = "var(--card-head, #e19580)";
const TYPED = "var(--font-typed, ui-monospace)";
// The blue rules of a 3 x 5 card, one every 32px, under the text lines.
const RULED =
  "repeating-linear-gradient(to bottom, transparent 0, transparent 31px, " +
  `${RULE} 31px, ${RULE} 32px)`;

function GoogleMark() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#FFC107"
        d={
          "M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36" +
          "c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1" +
          "l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24" +
          "s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
        }
      />
      <path
        fill="#FF3D00"
        d={
          "m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12" +
          "c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7" +
          "C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
        }
      />
      <path
        fill="#4CAF50"
        d={
          "M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36" +
          "c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
        }
      />
      <path
        fill="#1976D2"
        d={
          "M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2" +
          "C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
        }
      />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const host = (await headers()).get("host") ?? "";
  const href = googleSignInUrl(host, safeNext(next));

  return (
    <div className="flex justify-center py-6 sm:py-16">
      {/* A ruled index card, the object everything here is filed on. */}
      <section
        className="w-full max-w-md rounded-md border shadow-sm"
        style={{ background: STOCK, borderColor: LINE, color: INK }}
        data-testid="login-card"
      >
        <div
          className="px-6 pt-5 pb-3 border-b-2"
          style={{ borderColor: HEAD_RULE }}
        >
          <p
            className="text-xs uppercase tracking-wide"
            style={{ color: INK_2, fontFamily: TYPED }}
          >
            Sign in
          </p>
        </div>
        <div
          className="px-6 pt-4 pb-6 flex flex-col gap-5"
          style={{ backgroundImage: RULED }}
        >
          <h1 className="font-serif text-3xl tracking-tight leading-8">
            Knowledge{" "}
            <span className="italic" style={{ color: "var(--accent)" }}>
              Compounder
            </span>
          </h1>
          <p className="leading-8" style={{ color: INK_2 }}>
            Save what you read. Get flashcards that make it stick, links to
            what you read before, and themes worth writing about.
          </p>
          {error && (
            <p
              role="alert"
              className="text-sm rounded-md border px-3 py-2"
              style={{
                borderColor: "#e3a08c",
                background: "var(--danger-wash, #fbefec)",
                color: "#8a2a14",
              }}
              data-testid="login-error"
            >
              Sign-in didn&apos;t finish. Try again.
            </p>
          )}
          <a
            href={href}
            className={
              "inline-flex min-h-11 items-center justify-center gap-3 " +
              "rounded-md px-5 font-medium no-underline"
            }
            style={{ background: "var(--accent)", color: STOCK }}
            data-testid="google-sign-in"
          >
            <span className="inline-flex rounded-sm bg-white p-0.5">
              <GoogleMark />
            </span>
            Continue with Google
          </a>
          <p className="text-sm leading-8" style={{ color: INK_2 }}>
            Your library is yours alone. Decks you share stay open to anyone
            with the link.
          </p>
        </div>
      </section>
    </div>
  );
}
