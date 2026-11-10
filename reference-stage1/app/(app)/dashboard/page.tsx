import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { EmptyState, Section } from "@/components/ui/section";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { formatDate, formatDateTime, todayLocal } from "@/lib/datetime";
import { DECISION_STATUS, OPEN_TASK_STATUSES, TASK_STATUS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "لوحة القيادة" };

const BAR: Record<Tone, string> = { ok: "bg-st-ok", warn: "bg-st-warn", late: "bg-st-late", info: "bg-st-info", idle: "bg-st-idle" };

export default async function DashboardPage() {
  // Everything here is real data; RLS decides what each user can see.
  const today = todayLocal();
  const supabase = await createClient();
  const [meetingsRes, approvedRes, decisionsRes, upcomingRes, tasksRes, overdueRes, overdueListRes, projectsRes] = await Promise.all([
    supabase.from("meetings").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("decisions").select("id", { count: "exact", head: true }).is("archived_at", null).in("status", ["approved", "in_progress", "executed"]),
    supabase.from("decisions").select("id, number, title, status").is("archived_at", null).order("number", { ascending: false }).limit(5),
    supabase.from("meetings").select("id, title, scheduled_at").is("archived_at", null).eq("status", "scheduled").gte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(4),
    supabase.from("tasks").select("status").is("archived_at", null).neq("status", "cancelled").limit(5000),
    supabase.from("tasks").select("id", { count: "exact", head: true }).is("archived_at", null).lt("due_date", today).in("status", OPEN_TASK_STATUSES),
    supabase.from("tasks").select("id, title, due_date, committees(name_ar)").is("archived_at", null).lt("due_date", today).in("status", OPEN_TASK_STATUSES).order("due_date").limit(5),
    supabase.from("projects").select("id, name").is("archived_at", null).in("status", ["planned", "active"]).order("created_at", { ascending: false }).limit(6),
  ]);

  const byStatus = new Map<string, number>();
  ((tasksRes.data ?? []) as { status: string }[]).forEach((t) => byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1));
  const total = Array.from(byStatus.values()).reduce((a, b) => a + b, 0);
  const awaiting = byStatus.get("awaiting_approval") ?? 0;
  const overdueCount = overdueRes.count ?? 0;

  const decisions = (decisionsRes.data ?? []) as { id: string; number: string; title: string; status: string }[];
  const upcoming = (upcomingRes.data ?? []) as { id: string; title: string; scheduled_at: string }[];
  const overdueList = (overdueListRes.data ?? []) as unknown as { id: string; title: string; due_date: string; committees: { name_ar: string } | null }[];
  const projects = (projectsRes.data ?? []) as { id: string; name: string }[];
  const progRes = projects.length ? await supabase.from("project_progress").select("project_id, progress").in("project_id", projects.map((p) => p.id)) : { data: [] };
  const prog = new Map(((progRes.data ?? []) as { project_id: string; progress: number }[]).map((r) => [r.project_id, Number(r.progress)]));

  const stats = [
    { label: "الاجتماعات", value: meetingsRes.count ?? 0 },
    { label: "القرارات المعتمدة", value: approvedRes.count ?? 0 },
    { label: "إجمالي المهام", value: total },
    { label: "مكتملة", value: byStatus.get("completed") ?? 0 },
    { label: "قيد التنفيذ", value: byStatus.get("in_progress") ?? 0 },
    { label: "متأخرة", value: overdueCount, late: overdueCount > 0 },
  ];
  const distribution: { key: string; tone: Tone }[] = [
    { key: "completed", tone: "ok" }, { key: "in_progress", tone: "info" }, { key: "awaiting_approval", tone: "warn" },
    { key: "on_hold", tone: "idle" }, { key: "not_started", tone: "idle" }, { key: "new", tone: "idle" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-forest">لوحة القيادة</h1>
        <p className="mt-1 text-sm text-muted">نظرة عامة على أعمال اللجنة.</p>
      </div>

      <dl className="grid grid-cols-2 divide-x divide-x-reverse divide-line border border-line bg-white sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="border-b border-line px-4 py-4 lg:border-b-0">
            <dd className={cn("font-display text-3xl font-bold", s.late ? "text-st-late" : "text-forest")}>{s.value}</dd>
            <dt className="mt-1 text-sm text-muted">{s.label}</dt>
          </div>
        ))}
      </dl>

      <Section title="تحتاج إلى تدخل" hint="مهام متأخرة أو بانتظار الاعتماد">
        {overdueList.length === 0 && awaiting === 0 ? (
          <EmptyState title="لا توجد مهام تحتاج إلى تدخل الآن." />
        ) : (
          <ul className="divide-y divide-line">
            {awaiting > 0 ? (
              <li className="flex items-center gap-3 px-4 py-3 text-sm">
                <AlertTriangle size={18} className="shrink-0 text-st-warn" />
                <Link href="/tasks?status=awaiting_approval" className="flex-1 font-medium text-forest hover:underline">{awaiting} مهمة بانتظار اعتماد الإنجاز</Link>
              </li>
            ) : null}
            {overdueList.map((t) => (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-st-late" />
                <div className="min-w-0 flex-1">
                  <Link href={`/tasks/${t.id}`} className="font-medium text-forest hover:underline">{t.title}</Link>
                  <p className="text-sm text-muted">{t.committees?.name_ar ?? "بلا لجنة"}</p>
                </div>
                <span className="shrink-0 text-sm text-st-late">استحقت {formatDate(t.due_date)}</span>
              </li>
            ))}
            {overdueCount > overdueList.length ? (
              <li className="px-4 py-3 text-sm"><Link href="/tasks?overdue=1" className="text-forest hover:underline">عرض كل المهام المتأخرة ({overdueCount})</Link></li>
            ) : null}
          </ul>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="توزيع المهام حسب الحالة">
          {total === 0 ? <EmptyState title="لا توجد مهام بعد." action="تظهر هنا حالة المهام عند إنشائها." /> : (
            <div className="space-y-3 px-4 py-4">
              <div className="flex h-3 overflow-hidden rounded-sm bg-ivory" role="img" aria-label="توزيع المهام حسب الحالة">
                {distribution.map((d) => <div key={d.key} className={BAR[d.tone]} style={{ width: `${((byStatus.get(d.key) ?? 0) / total) * 100}%` }} />)}
              </div>
              <ul className="grid grid-cols-2 gap-2 text-sm">
                {distribution.map((d) => (
                  <li key={d.key} className="flex items-center gap-2">
                    <span className={cn("size-2.5 rounded-sm", BAR[d.tone])} />
                    <span className="flex-1">{TASK_STATUS[d.key]?.label}</span>
                    <span className="font-medium">{byStatus.get(d.key) ?? 0}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="تقدم المشاريع الجارية">
          {projects.length === 0 ? <EmptyState title="لا توجد مشاريع جارية." /> : (
            <ul className="space-y-4 px-4 py-4">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="mb-1 block text-sm text-forest hover:underline">{p.name}</Link>
                  <ProgressBar value={prog.get(p.id) ?? 0} label={p.name} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="آخر القرارات">
          {decisions.length === 0 ? <EmptyState title="لا توجد قرارات بعد." /> : (
            <ul className="divide-y divide-line">
              {decisions.map((d) => {
                const st = DECISION_STATUS[d.status];
                return (
                  <li key={d.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="shrink-0 text-xs text-muted" dir="ltr">{d.number}</span>
                    <Link href={`/decisions/${d.id}`} className="flex-1 text-sm text-forest hover:underline">{d.title}</Link>
                    {st ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="الاجتماعات القادمة">
          {upcoming.length === 0 ? <EmptyState title="لا توجد اجتماعات مجدولة قادمة." /> : (
            <ul className="divide-y divide-line">
              {upcoming.map((m) => (
                <li key={m.id} className="px-4 py-3 text-sm">
                  <Link href={`/meetings/${m.id}`} className="text-forest hover:underline">{m.title}</Link>
                  <p className="text-xs text-muted">{formatDateTime(m.scheduled_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
