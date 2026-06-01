"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

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
      setMessage({ kind: "error", text: "Paste a Readwise token first." });
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
        setMessage({ kind: "success", text: "Readwise token saved." });
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
          text: `Synced — ${data.added} new, ${data.skipped} already known${
            data.errors.length ? `, ${data.errors.length} errors` : ""
          }.`,
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

  return (
    <section
      className="border border-[color:var(--border)] bg-[color:var(--card)] rounded-md p-6 flex flex-col gap-5"
      data-testid="integration-readwise"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl tracking-tight">Readwise</h2>
          <p className="text-xs text-[color:var(--muted)] mt-1">
            Status:{" "}
            <span
              data-testid="readwise-status"
              className={
                readwise.configured ? "text-[color:var(--accent)]" : ""
              }
            >
              {readwise.configured ? "connected" : "not configured"}
            </span>
            {readwise.lastSyncedAt && (
              <>
                {" · last synced "}
                <span data-testid="readwise-last-synced">
                  {new Date(readwise.lastSyncedAt).toLocaleString()}
                </span>
              </>
            )}
          </p>
        </div>
        <a
          href="https://readwise.io/access_token"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[color:var(--accent)] underline"
        >
          Get your token
        </a>
      </header>

      <form
        onSubmit={handleSaveToken}
        className="flex flex-col gap-2"
        data-testid="readwise-token-form"
      >
        <label
          htmlFor="readwise-token"
          className="text-sm font-medium text-[color:var(--foreground)]"
        >
          {readwise.configured ? "Replace token" : "Readwise API token"}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="readwise-token"
            data-testid="readwise-token-input"
            type="password"
            autoComplete="off"
            placeholder="Paste your Readwise token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={busy}
            className="flex-1 min-w-[260px] rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm font-mono text-[color:var(--foreground)] placeholder:text-[color:var(--muted)] focus:border-[color:var(--accent)] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || token.trim().length === 0}
            data-testid="readwise-token-save"
            className="rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
          >
            {savingToken ? "Saving…" : "Save token"}
          </button>
        </div>
      </form>

      <div className="border-t border-[color:var(--border)] pt-5">
        <button
          type="button"
          onClick={handleSync}
          disabled={busy || !readwise.configured}
          data-testid="readwise-sync-button"
          className="rounded-md border border-[color:var(--accent)] px-4 py-2 text-sm font-medium text-[color:var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[color:var(--accent)] hover:text-white"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
        {!readwise.configured && (
          <p className="text-xs text-[color:var(--muted)] mt-2">
            Save a token first to enable syncing.
          </p>
        )}
      </div>

      {message && (
        <div
          role="status"
          data-testid="integration-message"
          className={`text-sm rounded-md border px-3 py-2 ${
            message.kind === "error"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {lastSync && (
        <details
          className="text-xs text-[color:var(--muted)]"
          data-testid="sync-details"
        >
          <summary className="cursor-pointer">Sync details</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded bg-[color:var(--background)] p-3 font-mono">
            {JSON.stringify(lastSync, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}
