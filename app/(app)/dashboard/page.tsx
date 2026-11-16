import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { EmptyState, Section } from "@/components/ui/section";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, requireSession } from "@/lib/auth/session";
import { formatDate, formatDateTime, todayLocal } from "@/lib/datetime";
import { DUTY_START_DATE, summarize, type DutyRow } from "@/lib/duty";
import { DECISION_STATUS, OPEN_TASK_STATUSES } from "@/lib/labels";
import { SUBMISSION_KIND } from "@/lib/submissions";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "لوحة القيادة" };

type Tile = { label: string; value: string; href: string; alert?: boolean };

function Tiles({ items }: { items: Tile[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-4">
      {items.map((t) => (
        <Link key={t.label} href={t.href} className="block bg-white px-4 py-4 hover:bg-ivory focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest">
          <dd className={cn("font-display text-3xl font-bold", t.alert ? "text-st-late" : "text-forest")}>{t.value}</dd>
          <dt className="mt-1 text-sm text-muted">{t.label}</dt>
        </Link>
      ))}
    </dl>
  );
}

export default async function DashboardPage() {
  const ctx = await requireSession();
  const supabase = await createClient();
  const today = todayLocal();
  const nowIso = new Date().toISOString();
  const weekAgo = new Date(Date.parse(today) - 6 * 86_400_000).toISOString().slice(0, 10);

  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const head = { count: "exact", head: true } as const;
  const none = { data: null as null };

  const seeTasks = can(ctx, "tasks.view") || can(ctx, "tasks.manage");
  const seeDecisions = can(ctx, "decisions.view") || can(ctx, "decisions.manage");
  const seeMeetings = can(ctx, "meetings.view") || can(ctx, "meetings.manage");
  const seeProjects = can(ctx, "projects.view") || can(ctx, "projects.manage");
  const seeSubmissions = can(ctx, "submissions.view") || can(ctx, "submissions.manage");
  const seeDuty = can(ctx, "duty.view") || can(ctx, "duty.manage");

  const [
    openTasks, overdueCount, awaitingCount, myCount,
    proposedDecisions, inProgressDecisions,
    upcomingCount, minutesPending,
    activeProjects, newSubs, urgentSubs,
    overdueTasks, myTasks, newSubsList, upcoming, decisions, projects, duty,
  ] = await Promise.all([
    seeTasks ? count(supabase.from("tasks").select("id", head).is("archived_at", null).in("status", OPEN_TASK_STATUSES)) : 0,
    seeTasks ? count(supabase.from("tasks").select("id", head).is("archived_at", null).in("status", OPEN_TASK_STATUSES).lt("due_date", today)) : 0,
    seeTasks ? count(supabase.from("tasks").select("id", head).is("archived_at", null).eq("status", "awaiting_approval")) : 0,
    seeTasks ? count(supabase.from("tasks").select("id, task_assignees!inner(user_id)", head).is("archived_at", null)
      .in("status", [...OPEN_TASK_STATUSES, "awaiting_approval"]).eq("task_assignees.user_id", ctx.userId)) : 0,
    seeDecisions ? count(supabase.from("decisions").select("id", head).is("archived_at", null).eq("status", "proposed")) : 0,
    seeDecisions ? count(supabase.from("decisions").select("id", head).is("archived_at", null).eq("status", "in_progress")) : 0,
    seeMeetings ? count(supabase.from("meetings").select("id", head).is("archived_at", null).eq("status", "scheduled").gte("starts_at", nowIso)) : 0,
    seeMeetings ? count(supabase.from("meetings").select("id", head).is("archived_at", null).in("status", ["held", "completed"]).is("minutes_approved_at", null)) : 0,
    seeProjects ? count(supabase.from("projects").select("id", head).is("archived_at", null).eq("status", "active")) : 0,
    seeSubmissions ? count(supabase.from("submissions").select("id", head).is("archived_at", null).eq("status", "new")) : 0,
    seeSubmissions ? count(supabase.from("submissions").select("id", head).is("archived_at", null).eq("urgent", true).in("status", ["new", "under_review", "accepted", "in_progress"])) : 0,

    seeTasks ? supabase.from("tasks").select("id, title, due_date, committees(name_ar)").is("archived_at", null)
      .in("status", OPEN_TASK_STATUSES).lt("due_date", today).order("due_date").limit(5) : none,
    seeTasks ? supabase.from("tasks").select("id, title, due_date, status, task_assignees!inner(user_id)").is("archived_at", null)
      .in("status", [...OPEN_TASK_STATUSES, "awaiting_approval"]).eq("task_assignees.user_id", ctx.userId)
      .order("due_date", { nullsFirst: false }).limit(5) : none,
    seeSubmissions ? supabase.from("submissions").select("id, ref, title, kind, urgent").is("archived_at", null).eq("status", "new")
      .order("urgent", { ascending: false }).order("submitted_at", { ascending: false }).limit(5) : none,
    seeMeetings ? supabase.from("meetings").select("id, title, starts_at, location").is("archived_at", null).eq("status", "scheduled")
      .gte("starts_at", nowIso).order("starts_at").limit(3) : none,
    seeDecisions ? supabase.from("decisions").select("id, number, title, status").is("archived_at", null).order("created_at", { ascending: false }).limit(5) : none,
    seeProjects ? supabase.from("projects").select("id, name").is("archived_at", null).eq("status", "active").order("created_at", { ascending: false }).limit(5) : none,
    seeDuty && today >= DUTY_START_DATE
      ? supabase.from("duty_reports")
          .select("id, person_name, duty_date, attendance, delay_minutes, c1, c2, c3, c4, c5, c6, c7, rating, shortage_status, submitted_at")
          .gte("duty_date", weekAgo > DUTY_START_DATE ? weekAgo : DUTY_START_DATE).lte("duty_date", today).limit(500)
      : none,
  ]);

  const projectIds = ((projects.data ?? []) as { id: string }[]).map((p) => p.id);
  const progress = projectIds.length
    ? ((await supabase.from("project_progress").select("project_id, progress").in("project_id", projectIds)).data ?? []) as { project_id: string; progress: number }[]
    : [];
  const progressOf = new Map(progress.map((p) => [p.project_id, Number(p.progress)]));

  const dutyStats = seeDuty && today >= DUTY_START_DATE
    ? summarize((duty.data ?? []) as DutyRow[], weekAgo > DUTY_START_DATE ? weekAgo : DUTY_START_DATE, today, today) : null;

  const tiles: Tile[] = [];
  if (seeTasks) tiles.push(
    { label: "مهام جارية", value: String(openTasks), href: "/tasks" },
    { label: "مهام متأخرة", value: String(overdueCount), href: "/tasks?overdue=1", alert: overdueCount > 0 },
    { label: "بانتظار اعتماد الإنجاز", value: String(awaitingCount), href: "/tasks?status=awaiting_approval", alert: awaitingCount > 0 },
    { label: "مهامي", value: String(myCount), href: `/tasks?assignee=${ctx.userId}` },
  );
  if (seeDecisions) tiles.push(
    { label: "قرارات مقترحة", value: String(proposedDecisions), href: "/decisions?status=proposed" },
    { label: "قرارات قيد التنفيذ", value: String(inProgressDecisions), href: "/decisions?status=in_progress" },
  );
  if (seeMeetings) tiles.push(
    { label: "اجتماعات قادمة", value: String(upcomingCount), href: "/meetings" },
    { label: "محاضر بلا اعتماد", value: String(minutesPending), href: "/meetings", alert: minutesPending > 0 },
  );
  if (seeProjects) tiles.push({ label: "مشاريع جارية", value: String(activeProjects), href: "/projects?status=active" });
  if (seeSubmissions) tiles.push(
    { label: "رسائل جديدة", value: String(newSubs), href: "/submissions?status=new", alert: newSubs > 0 },
    { label: "رسائل عاجلة مفتوحة", value: String(urgentSubs), href: "/submissions?urgent=1", alert: urgentSubs > 0 },
  );
  if (dutyStats) tiles.push(
    { label: "الحضور في الوقت (7 أيام)", value: dutyStats.onTimeRate === null ? "—" : `${dutyStats.onTimeRate}%`, href: "/duty?days=7" },
    { label: "أيام مداومة بلا تقرير", value: String(dutyStats.missingDays.length), href: "/duty?days=7", alert: dutyStats.missingDays.length > 0 },
  );

  const overdueRows = (overdueTasks.data ?? []) as unknown as { id: string; title: string; due_date: string; committees: { name_ar: string } | null }[];
  const subsRows = (newSubsList.data ?? []) as { id: string; ref: string; title: string; kind: string; urgent: boolean }[];
  const myRows = (myTasks.data ?? []) as { id: string; title: string; due_date: string | null }[];
  const meetingRows = (upcoming.data ?? []) as { id: string; title: string; starts_at: string; location: string | null }[];
  const decisionRows = (decisions.data ?? []) as { id: string; number: string; title: string; status: string }[];
  const projectRows = (projects.data ?? []) as { id: string; name: string }[];
  const attention = overdueRows.length + subsRows.length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-forest">لوحة القيادة</h1>
        <p className="mt-1 text-sm text-muted">مرحبًا {ctx.fullName}. اضغط على أي رقم لفتح القائمة المرتبطة به.</p>
      </div>

      {tiles.length === 0 ? <EmptyState title="لا توجد أقسام متاحة لحسابك بعد." /> : <Tiles items={tiles} />}

      {seeTasks || seeSubmissions ? (
        <Section title="تحتاج إلى تدخل" hint={attention ? `${attention} عنصرًا` : undefined}>
          {attention === 0 ? <EmptyState title="لا شيء يحتاج إلى تدخل الآن." /> : (
            <ul className="divide-y divide-line">
              {overdueRows.map((t) => (
                <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-st-late" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/tasks/${t.id}`} className="font-medium text-forest hover:underline">{t.title}</Link>
                    <p className="text-sm text-muted">مهمة متأخرة{t.committees ? ` · ${t.committees.name_ar}` : ""}</p>
                  </div>
                  <span className="shrink-0 text-sm text-st-late">{formatDate(t.due_date)}</span>
                </li>
              ))}
              {subsRows.map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                  <AlertTriangle size={18} className={cn("mt-0.5 shrink-0", s.urgent ? "text-st-late" : "text-st-warn")} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/submissions/${s.id}`} className="font-medium text-forest hover:underline">{s.title}</Link>
                    <p className="text-sm text-muted">{SUBMISSION_KIND[s.kind]?.label ?? s.kind} جديدة · <span dir="ltr">{s.ref}</span></p>
                  </div>
                  {s.urgent ? <StatusBadge tone="late">عاجلة</StatusBadge> : null}
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {seeTasks ? (
          <Section title="مهامي" hint="المسندة إليّ والمفتوحة">
            {myRows.length === 0 ? <EmptyState title="لا توجد مهام مسندة إليك." /> : (
              <ul className="divide-y divide-line">
                {myRows.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <Link href={`/tasks/${t.id}`} className="text-forest hover:underline">{t.title}</Link>
                    <span className={cn("shrink-0 text-xs", t.due_date && t.due_date < today ? "text-st-late" : "text-muted")}>
                      {t.due_date ? formatDate(t.due_date) : "بلا موعد"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        {seeMeetings ? (
          <Section title="الاجتماعات القادمة">
            {meetingRows.length === 0 ? <EmptyState title="لا توجد اجتماعات مجدولة." /> : (
              <ul className="divide-y divide-line">
                {meetingRows.map((m) => (
                  <li key={m.id} className="px-4 py-3 text-sm">
                    <Link href={`/meetings/${m.id}`} className="font-medium text-forest hover:underline">{m.title}</Link>
                    <p className="mt-0.5 text-xs text-muted">{formatDateTime(m.starts_at)}{m.location ? ` · ${m.location}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        {seeDecisions ? (
          <Section title="آخر القرارات">
            {decisionRows.length === 0 ? <EmptyState title="لا توجد قرارات بعد." /> : (
              <ul className="divide-y divide-line">
                {decisionRows.map((d) => {
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
        ) : null}

        {seeProjects ? (
          <Section title="تقدم المشاريع الجارية">
            {projectRows.length === 0 ? <EmptyState title="لا توجد مشاريع جارية." /> : (
              <ul className="space-y-4 px-4 py-4">
                {projectRows.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="mb-1 block text-sm text-forest hover:underline">{p.name}</Link>
                    <ProgressBar value={Math.round(progressOf.get(p.id) ?? 0)} label={p.name} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}
      </div>
    </div>
  );
}
