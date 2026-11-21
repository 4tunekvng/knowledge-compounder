import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { listIntegrationStatus } from "@/lib/services/ingest-orchestrator";
import { requireUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requireUser();
  const providers = await listIntegrationStatus(user.id);
  const readwise = providers.find((p) => p.provider === "readwise");

  return (
    <div className="flex max-w-[760px] flex-col gap-12">
      <section>
        <h1 className="text-title font-medium">Imports</h1>
        <p className="mt-3 text-ui text-ink-2">
          Connect Readwise, then bring your highlights into the library with
          one button. Each one gets the same note, flashcards and main ideas as
          something you capture by hand.
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
    </div>
  );
}
