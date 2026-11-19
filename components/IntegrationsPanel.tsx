"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useLocalTime } from "@/lib/use-local-time";

interface ProviderStatus {
  provider: string;
  configured: boolean;
  lastSyncedAt: string | null;
}

interface SyncResult {
  provider: string;
  added: number;
  skipped: number;
  errors: string[];
  lastSyncedAt: string | null;
  reachedLimit: boolean;
}

export function IntegrationsPanel({ readwise }: { readwise: ProviderStatus }) {
  const [token, setToken] = useState("");
  const [savingToken, startSaveTransition] = useTransition();
  const [syncing, startSyncTransition] = useTransition();
  const [message, setMessage] = useState<
    | { kind: "success"; text: string }
    | { kind: "error"; text: string }
    | null
  >(null);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const router = useRouter();

  async function handleSaveToken(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const trimmed = token.trim();
    if (!trimmed) {
      setMessage({ kind: "error", text: "Paste a Readwise token first" });
      return;
    }
    startSaveTransition(async () => {
      try {
        const res = await fetch("/api/integrations/readwise/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: trimmed }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessage({ kind: "error", text: data.error ?? "Save failed." });
          return;
        }
        setToken("");
        setMessage({ kind: "success", text: "Token saved. Readwise is connected." });
        router.refresh();
      } catch (err) {
        setMessage({
          kind: "error",
          text: err instanceof Error ? err.message : "Network error.",
        });
      }
    });
  }

  async function handleSync() {
    setMessage(null);
    setLastSync(null);
    startSyncTransition(async () => {
      try {
        const res = await fetch("/api/integrations/readwise/sync", {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) {
          setMessage({ kind: "error", text: data.error ?? "Sync failed." });
          return;
        }
        setLastSync(data as SyncResult);
        setMessage({
          kind: "success",
          text: `Synced: ${data.added} new, ${data.skipped} already in your library${
            data.errors.length ? `, ${data.errors.length} failed` : ""
          }.${
            data.added
              ? " New highlights get their notes and cards in the" +
                " background, a few at a time."
              : ""
          }`,
        });
        router.refresh();
      } catch (err) {
        setMessage({
          kind: "error",
          text: err instanceof Error ? err.message : "Network error.",
        });
      }
    });
  }

  const busy = savingToken || syncing;
  const syncedLabel = useLocalTime(() =>
    readwise.lastSyncedAt
      ? new Date(readwise.lastSyncedAt).toLocaleString("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "",
  );

  return (
    <section
      className="panel flex flex-col gap-8 p-6 sm:p-8"
      data-testid="integration-readwise"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="section-title">Readwise</h2>
          <p className="mt-1 flex items-center gap-2 text-ui text-ink-2">
            <span
              aria-hidden
              className={
                "size-2 rounded-full " +
                (readwise.configured ? "bg-ok" : "bg-line-strong")
              }
            />
            <span data-testid="readwise-status">
              {readwise.configured ? "Connected" : "Not connected"}
            </span>
            {readwise.lastSyncedAt && (
              <span className="text-ink-3">
                {" · last synced "}
                <span data-testid="readwise-last-synced">{syncedLabel}</span>
              </span>
            )}
          </p>
        </div>
        <a
          href="https://readwise.io/access_token"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-ui text-ink-2"
        >
          Get your token
          <ArrowUpRight aria-hidden size={16} strokeWidth={1.5} />
        </a>
      </header>

      <form
        onSubmit={handleSaveToken}
        className="flex flex-col gap-2"
        data-testid="readwise-token-form"
      >
        <label htmlFor="readwise-token" className="text-ui font-medium">
          {readwise.configured ? "Replace token" : "Readwise access token"}
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="readwise-token"
            data-testid="readwise-token-input"
            type="password"
            autoComplete="off"
            placeholder="Paste your token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={busy}
            className="field min-w-0 flex-1"
          />
          <button
            type="submit"
            disabled={busy || token.trim().length === 0}
            data-testid="readwise-token-save"
            className="btn btn-secondary"
          >
            {savingToken ? "Saving…" : "Save token"}
          </button>
        </div>
      </form>

      <div
        className={
          "flex flex-col gap-3 border-t border-line pt-8 sm:flex-row " +
          "sm:items-center sm:justify-between"
        }
      >
        <p className="text-ui text-ink-2">
          {readwise.configured
            ? "Sync fetches highlights added since the last sync."
            : "Save a token first to start syncing."}
        </p>
        <button
          type="button"
          onClick={handleSync}
          disabled={busy || !readwise.configured}
          data-testid="readwise-sync-button"
          className="btn btn-primary"
        >
          <RefreshCw aria-hidden size={16} strokeWidth={1.5} />
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {message && (
        <p
          role="status"
          data-testid="integration-message"
          className={
            "rounded-lg px-4 py-3 text-ui " +
            (message.kind === "error"
              ? "bg-danger-wash text-danger"
              : "bg-raised text-ok")
          }
        >
          {message.text}
        </p>
      )}

      {lastSync && (
        <details className="text-meta text-ink-3" data-testid="sync-details">
          <summary className="cursor-pointer">Sync details</summary>
          <pre
            className={
              "mt-2 whitespace-pre-wrap rounded-lg bg-raised p-4"
            }
          >
            {JSON.stringify(lastSync, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}
