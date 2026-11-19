"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface PaperPickView {
  arxivId: string;
  title: string;
  summary: string;
  matched: string[];
  githubUrl: string | null;
}

type Kind = "more" | "less" | "save" | "open";

function send(arxivId: string, kind: Kind) {
  return fetch("/api/papers/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ arxivId, kind }),
  });
}

/** One daily pick: what it is, why it was picked, and three ways to steer. */
export function PaperPick({ pick }: { pick: PaperPickView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  function act(kind: Kind) {
    setError(null);
    startTransition(async () => {
      const res = await send(pick.arxivId, kind).catch(() => null);
      if (!res?.ok) {
        setError("Not saved. Try again.");
        return;
      }
      setDone(kind);
      if (kind === "less") router.refresh();
    });
  }

  const button = "btn btn-secondary btn-sm";

  return (
    <article data-testid="paper-pick" className="panel flex flex-col gap-3 p-5">
      <h3 className="font-serif text-lead">
        <a
          href={`https://arxiv.org/abs/${pick.arxivId}`}
          target="_blank"
          rel="noreferrer"
          onClick={() => void send(pick.arxivId, "open").catch(() => {})}
        >
          {pick.title}
        </a>
      </h3>
      <p className="text-ui text-ink-2">{pick.summary}</p>
      <p className="text-meta text-ink-3" data-testid="pick-why">
        Why you got this: {pick.matched.join(", ")}
        {pick.githubUrl && (
          <>
            {" · "}
            <a href={pick.githubUrl} target="_blank" rel="noreferrer">
              code
            </a>
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={pending || done === "more"}
          onClick={() => act("more")}
        >
          {done === "more" ? "More like this ✓" : "More like this"}
        </button>
        <button
          type="button"
          className={button}
          disabled={pending}
          onClick={() => act("less")}
        >
          Less like this
        </button>
        <button
          type="button"
          className={button}
          disabled={pending || done === "save"}
          onClick={() => act("save")}
        >
          {done === "save" ? "Saved ✓" : "Save"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}
    </article>
  );
}
