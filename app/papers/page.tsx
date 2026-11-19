import { PaperDataDelete } from "@/components/PaperDataDelete";
import { PaperInterests } from "@/components/PaperInterests";
import { PaperPick } from "@/components/PaperPick";
import { requireUser } from "@/lib/auth/user";
import { getProfile, todaysPicks } from "@/lib/papers/readers";

export const dynamic = "force-dynamic";

export default async function PapersPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const picks = profile ? await todaysPicks(user.id) : [];

  return (
    <div className="flex flex-col gap-12">
      <div>
        <h1 className="text-title font-medium">Papers</h1>
        <p className="mt-3 max-w-[40rem] text-ui text-ink-2">
          Three new machine-learning papers a day from arXiv and Hugging Face, picked
          for what you care about. Tell it more or less, and it learns.
        </p>
      </div>

      <section className="panel max-w-[40rem] p-6">
        <PaperInterests initial={profile?.interestsText ?? ""} />
      </section>

      {profile && (
        <section className="flex flex-col gap-4" data-testid="todays-picks">
          <h2 className="section-title">Today&rsquo;s picks</h2>
          {picks.length === 0 ? (
            <p className="text-ui text-ink-2" data-testid="no-picks">
              Nothing in the last few days matches your interests yet. Try broader
              words, or check back after tomorrow&rsquo;s papers arrive.
            </p>
          ) : (
            picks.map((p) => (
              <PaperPick
                key={p.arxivId}
                pick={{
                  arxivId: p.arxivId,
                  title: p.title,
                  summary: p.summary,
                  matched: p.matched,
                  githubUrl: p.githubUrl,
                }}
              />
            ))
          )}
        </section>
      )}

      {profile && <PaperDataDelete />}
    </div>
  );
}
