import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { listIntegrationStatus } from "@/lib/services/ingest-orchestrator";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const providers = await listIntegrationStatus();
  const readwise = providers.find((p) => p.provider === "readwise");

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="font-serif text-3xl tracking-tight mb-2">
          Auto-ingest
        </h1>
        <p className="text-[color:var(--muted)] max-w-2xl">
          Connect your reading sources so highlights flow into the corpus
          automatically. Each new highlight gets the same Claude treatment as
          a manual capture: 100-word reflection, three flashcards, concept
          tags, and cross-links.
        </p>
      </section>

      <IntegrationsPanel
        readwise={
          readwise ?? {
            provider: "readwise",
            configured: false,
            lastSyncedAt: null,
          }
        }
      />

      <section className="text-sm text-[color:var(--muted)] max-w-2xl">
        <h2 className="font-serif text-base text-[color:var(--foreground)] mb-2">
          Coming soon
        </h2>
        <p>
          Kindle (via send-to-Kindle email parsing) and Zotero (via Web API)
          implement the same <code>IngestSource</code> interface — they&apos;ll
          appear here once shipped. The pattern lives in{" "}
          <code>lib/services/ingest-source.ts</code>.
        </p>
      </section>
    </div>
  );
}
