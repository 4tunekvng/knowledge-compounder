"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ThemeView {
  id: number;
  label: string;
  summary: string;
  sourceIds: number[];
}

interface Props {
  themes: ThemeView[];
  sourceTitlesById: Record<number, string>;
  hasEnoughSources: boolean;
  sourceCount: number;
}

export function ThemesPanel({
  themes,
  sourceTitlesById,
  hasEnoughSources,
  sourceCount,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isFinding, startFinding] = useTransition();
  const [isDrafting, startDrafting] = useTransition();
  const [draftingId, setDraftingId] = useState<number | null>(null);
  const router = useRouter();

  function findThemes() {
    setError(null);
    startFinding(async () => {
      try {
        const res = await fetch("/api/themes", { method: "POST" });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to find themes.");
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error.");
      }
    });
  }

  function draftEssay(themeId: number) {
    setError(null);
    setDraftingId(themeId);
    startDrafting(async () => {
      try {
        const res = await fetch("/api/essay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ themeId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to draft essay.");
          return;
        }
        router.push(`/essays/${data.essay.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error.");
      } finally {
        setDraftingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-[color:var(--muted)]">
          {hasEnoughSources
            ? `Across ${sourceCount} processed sources.`
            : `Need at least 2 processed sources (you have ${sourceCount}).`}
        </p>
        <button
          onClick={findThemes}
          disabled={isFinding || !hasEnoughSources}
          data-testid="find-themes-button"
          className="rounded-md bg-[color:var(--accent)] text-white px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
        >
          {isFinding ? "Finding themes…" : "Find themes"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-700" role="alert" data-testid="themes-error">
          {error}
        </p>
      )}

      {themes.length === 0 ? (
        <div
          className="border border-dashed border-[color:var(--border)] rounded-md p-8 text-center text-[color:var(--muted)]"
          data-testid="themes-empty"
        >
          No themes yet. Click <strong>Find themes</strong> once you have a few captures.
        </div>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="themes-list">
          {themes.map((theme) => (
            <li
              key={theme.id}
              className="border border-[color:var(--border)] bg-[color:var(--card)] rounded-md p-5"
              data-testid={`theme-${theme.id}`}
            >
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-serif text-xl">{theme.label}</h3>
                <button
                  onClick={() => draftEssay(theme.id)}
                  disabled={isDrafting || draftingId !== null}
                  data-testid={`draft-essay-${theme.id}`}
                  className="rounded-md bg-[color:var(--foreground)] text-[color:var(--background)] px-3 py-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-80"
                >
                  {draftingId === theme.id ? "Drafting…" : "Draft essay"}
                </button>
              </div>
              <p className="mt-2 text-[color:var(--foreground)] leading-relaxed">
                {theme.summary}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-xs text-[color:var(--muted)]">From:</span>
                {theme.sourceIds.map((sid) => (
                  <Link
                    key={sid}
                    href={`/sources/${sid}`}
                    className="text-xs border border-[color:var(--border)] rounded-full px-2 py-0.5 no-underline text-[color:var(--foreground)] hover:text-[color:var(--accent)]"
                  >
                    {sourceTitlesById[sid] ?? `Source ${sid}`}
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
