"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CAPTURE_ACTION, EmptyCard } from "@/components/EmptyCard";
import { CatalogNo } from "@/components/CatalogNo";
import { countLabel, displayTitle } from "@/lib/format";

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

// Themes are lettered like the guide cards in a catalogue drawer: A, B, C.
function guideLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
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

  // Which other themes each source is also filed under: the links between
  // ideas that only show up when the same reading feeds two themes.
  const themesBySource = new Map<number, ThemeView[]>();
  for (const theme of themes) {
    for (const sid of theme.sourceIds) {
      themesBySource.set(sid, [...(themesBySource.get(sid) ?? []), theme]);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <div
        className={
          "flex flex-col gap-4 border-y border-line py-4 sm:flex-row " +
          "sm:items-center sm:justify-between"
        }
      >
        <p className="text-ui text-ink-2">
          {hasEnoughSources
            ? `Across your ${countLabel(sourceCount, "capture")} with notes`
            : "Themes need at least 2 captures with notes. " +
              `You have ${sourceCount}.`}
        </p>
        <button
          onClick={findThemes}
          disabled={isFinding || !hasEnoughSources}
          data-testid="find-themes-button"
          className="btn btn-primary"
        >
          {isFinding ? "Reading your captures…" : "Find themes"}
        </button>
      </div>

      {error && (
        <p className="text-ui text-danger" role="alert" data-testid="themes-error">
          {error}
        </p>
      )}

      {themes.length === 0 ? (
        <EmptyCard
          head="No themes yet"
          action={hasEnoughSources ? undefined : CAPTURE_ACTION}
          data-testid="themes-empty"
        >
          {hasEnoughSources
            ? "Press Find themes to group your captures by idea. Any theme " +
              "can then become a drafted essay."
            : "Capture a few things you read, then come back to see the " +
              "ideas they share."}
        </EmptyCard>
      ) : (
        <ul className="flex flex-col gap-16 pt-8" data-testid="themes-list">
          {themes.map((theme, i) => {
            const letter = guideLetter(i);
            return (
              <li
                key={theme.id}
                className={
                  "relative rounded-box border border-line bg-guide"
                }
                data-testid={`theme-${theme.id}`}
              >
                {/* The guide card's tab, standing up from its top edge. It
                    reaches 1px into the card so it covers the card's top
                    border and the two read as one piece of card. */}
                <span
                  aria-hidden
                  className={
                    "absolute -top-[33px] left-6 flex h-[34px] items-center " +
                    "rounded-t-box border border-b-0 border-line bg-guide px-4 " +
                    "font-typed text-ui"
                  }
                >
                  {letter}
                </span>
                {/* On a phone the button follows the filed captures, so it is
                    read last and sits near the thumb. From 640px up it
                    spans the title and summary rows, so the gap between
                    those two is the same in every theme. */}
                <div
                  className={
                    "flex flex-col p-6 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] " +
                    "sm:grid-rows-[auto_auto] sm:gap-x-8 sm:p-8"
                  }
                >
                  <h3 className="max-w-[36rem] text-lead font-medium">
                    <span className="sr-only">Theme {letter}: </span>
                    {theme.label}
                  </h3>
                  <button
                    onClick={() => draftEssay(theme.id)}
                    disabled={isDrafting || draftingId !== null}
                    data-testid={`draft-essay-${theme.id}`}
                    className={
                      "btn btn-secondary order-last mt-6 self-start " +
                      "sm:order-none sm:col-start-2 sm:row-span-2 " +
                      "sm:row-start-1 sm:mt-0"
                    }
                  >
                    {draftingId === theme.id ? "Drafting…" : "Draft an essay"}
                  </button>
                  <p
                    className={
                      "mt-4 max-w-[44rem] text-ui text-ink-2 sm:col-start-1"
                    }
                  >
                    {theme.summary}
                  </p>
                  <div className="sm:col-span-2">
                    <h4 className="mt-8 text-meta text-ink-3">
                      Captures in this theme
                    </h4>
                    <ul className="mt-2">
                      {theme.sourceIds.map((sid) => {
                        const also = (themesBySource.get(sid) ?? []).filter(
                          (t) => t.id !== theme.id,
                        );
                        return (
                          <li
                            key={sid}
                            className={
                              "flex items-baseline gap-4 border-t border-line " +
                              "py-3"
                            }
                          >
                            <CatalogNo id={sid} />
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/sources/${sid}`}
                                className={
                                  "text-ui text-ink no-underline " +
                                  "hover:text-accent"
                                }
                              >
                                {displayTitle(sourceTitlesById[sid] ?? "A capture")}
                              </Link>
                              {also.length > 0 && (
                                <p className="mt-1 text-meta text-accent">
                                  Also in{" "}
                                  {also
                                    .map((t) => `“${displayTitle(t.label, 60)}”`)
                                    .join(" and ")}
                                </p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
