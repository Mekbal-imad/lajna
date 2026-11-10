import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { DecisionFields } from "@/components/shared/decision-fields";
import { Section } from "@/components/ui/section";
import { can, requirePermission } from "@/lib/auth/session";
import { getActiveMembers, getCommittees } from "@/lib/data/lookups";
import { createClient } from "@/lib/supabase/server";
import { createDecision } from "../actions";

export const metadata = { title: "قرار جديد" };

export default async function NewDecisionPage({ searchParams }: { searchParams: Promise<{ meeting?: string }> }) {
  const ctx = await requirePermission("decisions.view");
  if (!can(ctx, "decisions.manage")) redirect("/forbidden");
  const { meeting } = await searchParams;

  const supabase = await createClient();
  const [{ data: ms }, committees, people] = await Promise.all([
    supabase.from("meetings").select("id, title, scheduled_at").is("archived_at", null).order("scheduled_at", { ascending: false }).limit(100),
    getCommittees(), getActiveMembers(),
  ]);
  const meetings = (ms ?? []).map((m: { id: string; title: string }) => ({ id: m.id, name: m.title }));
  const preset = meeting && meetings.some((m) => m.id === meeting) ? meeting : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/decisions" className="text-sm text-muted hover:text-forest">← القرارات</Link>
        <h1 className="mt-1 text-2xl font-bold text-forest">قرار جديد</h1>
        <p className="mt-1 text-sm text-muted">يُمنح القرار رقمًا تسلسليًا تلقائيًا عند الحفظ.</p>
      </div>
      <Section title="بيانات القرار">
        <div className="px-4 py-4">
          <ActionForm action={createDecision} submitLabel="حفظ القرار">
            <DecisionFields meetings={meetings} committees={committees} people={people}
              canApprove={can(ctx, "decisions.approve")} values={{ meetingId: preset, decidedOn: today }} />
          </ActionForm>
        </div>
      </Section>
    </div>
  );
}
