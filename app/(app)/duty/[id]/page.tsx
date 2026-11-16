import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field, Select } from "@/components/ui/action-form";
import { Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, requirePermission } from "@/lib/auth/session";
import { getCommittees } from "@/lib/data/lookups";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { ATTENDANCE, DUTIES, RATING_LABEL } from "@/lib/duty";
import { createClient } from "@/lib/supabase/server";
import { convertShortageToTask, setShortageStatus } from "../actions";

type Report = Record<string, unknown> & {
  id: string; person_name: string; duty_date: string; attendance: string; arrival_time: string | null;
  delay_minutes: number | null; attendance_note: string | null; rating: number | null; shortages: string | null;
  shortage_status: string; task_id: string | null; notes: string | null; submitted_at: string;
};

export default async function DutyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("duty.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("duty_reports").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as Report;
  const committees = await getCommittees();
  const canManage = can(ctx, "duty.manage");
  const att = ATTENDANCE[r.attendance];

  const row = (label: string, value: string | null | undefined) => (
    <div className="px-4 py-3 text-sm"><dt className="text-xs text-muted">{label}</dt><dd className="mt-0.5 whitespace-pre-wrap">{value || "—"}</dd></div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/duty" className="text-sm text-forest hover:underline">← المداومة</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-forest">{r.person_name} — {formatDate(r.duty_date)}</h1>
          {att ? <StatusBadge tone={att.tone}>{att.label}</StatusBadge> : null}
        </div>
        <p className="mt-1 text-xs text-muted">وصل التقرير {formatDateTime(r.submitted_at)}</p>
      </div>

      <Section title="الحضور">
        <dl className="divide-y divide-line">
          {row("وقت الوصول", r.arrival_time)}
          {row("مدة التأخر (مستخرجة من النص)", r.delay_minutes === null ? null : `${r.delay_minutes} دقيقة`)}
          {row("ملاحظة المداوم", r.attendance_note)}
        </dl>
      </Section>

      <Section title="مهام المداومة">
        <ul className="divide-y divide-line text-sm">
          {DUTIES.map((label, i) => {
            const v = r[`c${i + 1}`] as boolean | null;
            return (
              <li key={label} className="flex items-center justify-between px-4 py-3">
                <span>{i + 1}. {label}</span>
                {v === null ? <span className="text-xs text-muted">—</span> : <StatusBadge tone={v ? "ok" : "late"}>{v ? "تم" : "لم يتم"}</StatusBadge>}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="التقييم والملاحظات">
        <dl className="divide-y divide-line">
          {row("التقييم العام", r.rating ? RATING_LABEL[r.rating] : null)}
          {row("ملاحظات إضافية", r.notes)}
        </dl>
      </Section>

      <Section title="نواقص وأعطال">
        <dl className="divide-y divide-line">{row("ما ذُكر", r.shortages)}</dl>
        {r.shortage_status !== "none" ? (
          <div className="space-y-4 border-t border-line p-4">
            <p className="text-sm">الحالة: {r.shortage_status === "handled" ? <StatusBadge tone="ok">عولج</StatusBadge> : <StatusBadge tone="warn">مفتوح</StatusBadge>}</p>
            {r.task_id ? <p className="text-sm">حُوّل إلى مهمة: <Link className="text-forest underline" href={`/tasks/${r.task_id}`}>فتح المهمة</Link></p> : null}
            {canManage ? (
              <>
                <ActionForm action={setShortageStatus} variant="quiet" submitLabel={r.shortage_status === "handled" ? "إعادة فتح النقص" : "تسجيل أنه عولج"}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="status" value={r.shortage_status === "handled" ? "open" : "handled"} />
                </ActionForm>
                {!r.task_id ? (
                  <ActionForm action={convertShortageToTask} variant="quiet" submitLabel="تحويل إلى مهمة">
                    <input type="hidden" name="id" value={r.id} />
                    <Field label="عنوان المهمة" name="title" defaultValue={`معالجة نقص/عطل — مداومة ${r.duty_date}`} required />
                    <Select label="اللجنة المسؤولة" name="committeeId" placeholder="غير محددة"
                      options={committees.map((c) => ({ value: c.id, label: c.name }))} />
                  </ActionForm>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </Section>
    </div>
  );
}
