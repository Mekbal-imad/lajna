import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field, Select, TextArea } from "@/components/ui/action-form";
import { EmptyState, Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { HistorySection } from "@/components/shared/history-section";
import { can, requirePermission } from "@/lib/auth/session";
import { getActiveMembers, getCommittees, getDirectory } from "@/lib/data/lookups";
import { formatDateTime } from "@/lib/datetime";
import { SUBMISSION_KIND, SUBMISSION_STATUS } from "@/lib/submissions";
import { createClient } from "@/lib/supabase/server";
import { addSubmissionNote, convertToTask, setSubmissionArchived, updateSubmission } from "../actions";

type Sub = {
  id: string; ref: string; kind: string; title: string; details: string | null; area: string | null; urgent: boolean;
  proposed_solution: string | null; submitter_name: string | null; submitter_role: string | null;
  contact_requested: boolean; contact_info: string | null; status: string; assigned_to: string | null;
  task_id: string | null; submitted_at: string; archived_at: string | null;
};
type Note = { id: string; author_id: string | null; body: string; created_at: string };

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("submissions.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("submissions").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const s = data as Sub;
  const [{ data: notesData }, people, committees, names] = await Promise.all([
    supabase.from("submission_notes").select("id, author_id, body, created_at").eq("submission_id", id).order("created_at"),
    getActiveMembers(), getCommittees(), getDirectory(),
  ]);
  const notes = (notesData ?? []) as Note[];
  const canManage = can(ctx, "submissions.manage");
  const kind = SUBMISSION_KIND[s.kind];
  const st = SUBMISSION_STATUS[s.status];

  const row = (label: string, value: string | null | undefined) => (
    <div className="px-4 py-3 text-sm"><dt className="text-xs text-muted">{label}</dt><dd className="mt-0.5 whitespace-pre-wrap">{value || "—"}</dd></div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/submissions" className="text-sm text-forest hover:underline">← الاقتراحات والبلاغات</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-forest">{s.title}</h1>
          {kind ? <StatusBadge tone={kind.tone}>{kind.label}</StatusBadge> : null}
          {st ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : null}
          {s.urgent ? <StatusBadge tone="late">عاجلة</StatusBadge> : null}
          {s.archived_at ? <StatusBadge tone="idle">مؤرشفة</StatusBadge> : null}
        </div>
        <p className="mt-1 text-xs text-muted"><span dir="ltr">{s.ref}</span> · وصلت {formatDateTime(s.submitted_at)}</p>
      </div>

      <Section title="الرسالة">
        <dl className="divide-y divide-line">
          {row("التفاصيل", s.details)}
          {row("المجال المعني", s.area)}
          {row("الحل المقترح من المرسل", s.proposed_solution)}
          {row("المرسل", [s.submitter_name, s.submitter_role].filter(Boolean).join(" · "))}
          {row("طلب التواصل معه", s.contact_requested ? `نعم${s.contact_info ? ` — ${s.contact_info}` : ""}` : "لا")}
        </dl>
      </Section>

      {canManage ? (
        <Section title="المعالجة">
          <div className="space-y-5 p-4">
            <ActionForm action={updateSubmission} submitLabel="حفظ">
              <input type="hidden" name="id" value={s.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="الحالة" name="status" defaultValue={s.status}
                  options={Object.entries(SUBMISSION_STATUS).map(([value, v]) => ({ value, label: v.label }))} />
                <Select label="المكلّف بالمتابعة" name="assignedTo" placeholder="غير محدد" defaultValue={s.assigned_to ?? ""}
                  options={people.map((p) => ({ value: p.id, label: p.name }))} />
              </div>
            </ActionForm>

            {s.task_id ? (
              <p className="text-sm">حُوّلت إلى مهمة: <Link className="text-forest underline" href={`/tasks/${s.task_id}`}>فتح المهمة</Link></p>
            ) : (
              <ActionForm action={convertToTask} submitLabel="تحويل إلى مهمة" variant="quiet">
                <input type="hidden" name="id" value={s.id} />
                <Field label="عنوان المهمة" name="title" defaultValue={s.title} required />
                <Select label="اللجنة المسؤولة" name="committeeId" placeholder="غير محددة"
                  options={committees.map((c) => ({ value: c.id, label: c.name }))} />
              </ActionForm>
            )}
          </div>
        </Section>
      ) : null}

      <Section title="ملاحظات داخلية" hint={`${notes.length}`}>
        {notes.length === 0 ? <EmptyState title="لا توجد ملاحظات." /> : (
          <ul className="divide-y divide-line">
            {notes.map((n) => (
              <li key={n.id} className="px-4 py-3 text-sm">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <p className="mt-1 text-xs text-muted">{n.author_id ? names.get(n.author_id) ?? "مستخدم" : "—"} · {formatDateTime(n.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <div className="border-t border-line p-4">
            <ActionForm action={addSubmissionNote} submitLabel="إضافة ملاحظة" variant="quiet">
              <input type="hidden" name="id" value={s.id} />
              <TextArea label="ملاحظة جديدة" name="body" rows={3} required />
            </ActionForm>
          </div>
        ) : null}
      </Section>

      <HistorySection table="submissions" rowId={s.id} />

      {canManage ? (
        <ActionForm action={setSubmissionArchived} variant="quiet" submitLabel={s.archived_at ? "استعادة من الأرشيف" : "أرشفة الرسالة"}
          confirm={s.archived_at ? undefined : "ستنتقل الرسالة إلى الأرشيف. متابعة؟"}>
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="archive" value={s.archived_at ? "false" : "true"} />
        </ActionForm>
      ) : null}
    </div>
  );
}
