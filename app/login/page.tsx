import type { Metadata } from "next";
import { IndexCard } from "@/components/IndexCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · Knowledge Compounder",
};

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
  // /auth/start checks `next` and ties the sign-in to this browser.
  const href = `/auth/start?next=${encodeURIComponent(next ?? "/")}`;

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-8 sm:pt-8">
      <div>
        <h1 className="text-title font-medium">Knowledge Compounder</h1>
        <p className="mt-3 text-ui text-ink-2">
          Save what you read. Get flashcards that make it stick, links to what
          you read before, and themes worth writing about.
        </p>
      </div>
      {/* A ruled index card, the object everything here is filed on. */}
      <IndexCard
        head="Sign in"
        data-testid="login-card"
        footer={
          <a
            href={href}
            className="btn btn-primary w-full sm:w-auto"
            data-testid="google-sign-in"
          >
            {/* Google's mark keeps its own colours, on a white chip. */}
            <span className="inline-flex rounded-box bg-white p-0.5">
              <GoogleMark />
            </span>
            Continue with Google
          </a>
        }
      >
        {error && (
          <p role="alert" className="text-danger" data-testid="login-error">
            Sign-in didn&apos;t finish. Try again.
          </p>
        )}
        <p className="text-ink-2">
          Your library is yours alone. Decks you share stay open to anyone
          with the link.
        </p>
      </IndexCard>
    </div>
  );
}
