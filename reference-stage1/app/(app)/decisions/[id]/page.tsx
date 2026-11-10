import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { AttachmentsSection } from "@/components/shared/attachments-section";
import { DecisionFields } from "@/components/shared/decision-fields";
import { HistorySection } from "@/components/shared/history-section";
import { Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, requirePermission } from "@/lib/auth/session";
import { getActiveMembers, getCommittees, getDirectory } from "@/lib/data/lookups";
import { formatDate } from "@/lib/datetime";
import { DECISION_STATUS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { deleteDecision, setDecisionArchived, updateDecision } from "../actions";

export const metadata = { title: "تفاصيل القرار" };

type Decision = {
  id: string; number: string; title: string; details: string | null; meeting_id: string | null;
  decided_on: string; committee_id: string | null; assignee_id: string | null; due_date: string | null;
  status: string; archived_at: string | null;
};

export default async function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("decisions.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("decisions").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const d = data as Decision;

  const [{ data: ms }, committees, people, directory] = await Promise.all([
    supabase.from("meetings").select("id, title").order("scheduled_at", { ascending: false }).limit(100),
    getCommittees(), getActiveMembers(), getDirectory(),
  ]);
  const meetings = (ms ?? []).map((m: { id: string; title: string }) => ({ id: m.id, name: m.title }));
  const canManage = can(ctx, "decisions.manage");
  const st = DECISION_STATUS[d.status];
  const linked = meetings.find((m) => m.id === d.meeting_id);
  const canDelete = canManage && d.status === "proposed";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/decisions" className="text-sm text-muted hover:text-forest">← القرارات</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-forest">{d.title}</h1>
          {st ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : null}
          {d.archived_at ? <StatusBadge tone="idle">مؤرشف</StatusBadge> : null}
        </div>
        <p className="mt-1 text-sm text-muted">
          <span dir="ltr">{d.number}</span> · {formatDate(d.decided_on)}
          {linked ? <> · <Link href={`/meetings/${linked.id}`} className="text-forest hover:underline">{linked.name}</Link></> : null}
        </p>
        <p className="text-sm text-muted">
          {d.assignee_id ? `المكلف: ${directory.get(d.assignee_id) ?? "—"}` : ""}
          {d.due_date ? ` · الاستحقاق: ${formatDate(d.due_date)}` : ""}
        </p>
      </div>

      {canManage ? (
        <Section title="تعديل القرار">
          <div className="px-4 py-4">
            <ActionForm action={updateDecision} submitLabel="حفظ التعديلات">
              <input type="hidden" name="id" value={d.id} />
              <DecisionFields meetings={meetings} committees={committees} people={people} editing
                canApprove={can(ctx, "decisions.approve")}
                values={{ title: d.title, details: d.details, meetingId: d.meeting_id, decidedOn: d.decided_on,
                  committeeId: d.committee_id, assigneeId: d.assignee_id, dueDate: d.due_date, status: d.status }} />
            </ActionForm>
          </div>
        </Section>
      ) : (
        <Section title="التفاصيل">
          <p className="whitespace-pre-wrap px-4 py-4 text-sm">{d.details || "لا توجد تفاصيل."}</p>
        </Section>
      )}

      <AttachmentsSection entityType="decision" entityId={d.id} canManage={canManage} />
      <HistorySection table="decisions" rowId={d.id} />

      {canManage ? (
        <Section title="إجراءات">
          <div className="flex flex-wrap gap-3 px-4 py-4">
            <ActionForm action={setDecisionArchived} variant="quiet"
              submitLabel={d.archived_at ? "استعادة من الأرشيف" : "أرشفة القرار"}>
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="archive" value={d.archived_at ? "false" : "true"} />
            </ActionForm>
            {canDelete ? (
              <ActionForm action={deleteDecision} variant="danger" submitLabel="حذف القرار"
                confirm="سيُحذف هذا المقترح نهائيًا. القرارات المعتمدة لا تُحذف بل تُؤرشف. متابعة؟">
                <input type="hidden" name="id" value={d.id} />
              </ActionForm>
            ) : (
              <p className="self-center text-xs text-muted">القرار الذي تجاوز مرحلة «مقترح» لا يُحذف؛ يمكن أرشفته.</p>
            )}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
