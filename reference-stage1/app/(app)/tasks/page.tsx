import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState, Section } from "@/components/ui/section";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, requirePermission } from "@/lib/auth/session";
import { getActiveMembers, getCommittees, getDirectory, getPriorities } from "@/lib/data/lookups";
import { formatDate, todayLocal } from "@/lib/datetime";
import { OPEN_TASK_STATUSES, TASK_STATUS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "المهام" };

type Row = {
  id: string; title: string; status: string; progress: number; due_date: string | null;
  committees: { name_ar: string } | null; projects: { name: string } | null; task_priorities: { name_ar: string } | null;
  task_assignees: { user_id: string }[];
};
type Search = { q?: string; status?: string; committee?: string; priority?: string; assignee?: string; view?: string; layout?: string; overdue?: string };
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const isUuid = (s?: string) => !!s && /^[0-9a-f-]{36}$/i.test(s);

export default async function TasksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requirePermission("tasks.view");
  const sp = await searchParams;
  const archived = sp.view === "archived";
  const board = sp.layout === "board";
  const today = todayLocal();

  const supabase = await createClient();
  const assigneeFilter = isUuid(sp.assignee);
  let query = supabase
    .from("tasks")
    .select(`id, title, status, progress, due_date, committees(name_ar), projects(name), task_priorities:priority_id(name_ar), task_assignees${assigneeFilter ? "!inner" : ""}(user_id)`)
    .order("due_date", { ascending: true, nullsFirst: false }).limit(300);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (sp.q?.trim()) query = query.ilike("title", `%${escapeLike(sp.q.trim())}%`);
  if (sp.status && sp.status in TASK_STATUS) query = query.eq("status", sp.status);
  if (isUuid(sp.committee)) query = query.eq("committee_id", sp.committee!);
  if (isUuid(sp.priority)) query = query.eq("priority_id", sp.priority!);
  if (assigneeFilter) query = query.eq("task_assignees.user_id", sp.assignee!);
  if (sp.overdue === "1") query = query.lt("due_date", today).in("status", OPEN_TASK_STATUSES);

  const [{ data, error }, committees, priorities, people, names] = await Promise.all([
    query, getCommittees(), getPriorities(true), getActiveMembers(), getDirectory(),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const canCreate = can(ctx, "tasks.manage") || can(ctx, "tasks.manage_committee");
  const sel = "rounded border border-line bg-white px-3 py-2 text-sm";
  const isLate = (r: Row) => !!r.due_date && r.due_date < today && OPEN_TASK_STATUSES.includes(r.status);
  const who = (r: Row) => r.task_assignees.map((a) => names.get(a.user_id) ?? "—").join("، ") || "غير مسندة";
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    Object.entries({ ...sp, ...extra }).forEach(([k, v]) => v && p.set(k, v));
    return `/tasks?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-forest">المهام والمتابعة</h1>
          <p className="mt-1 text-sm text-muted">إسناد المهام ومتابعة تقدمها واعتماد إنجازها.</p>
        </div>
        {canCreate ? (
          <Link href="/tasks/new" className="flex items-center gap-2 rounded bg-forest px-4 py-2 text-sm text-ivory hover:bg-forest-700">
            <Plus size={16} /> مهمة جديدة
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={qs({ view: "" })} className={cn("rounded px-3 py-1.5", !archived ? "bg-forest text-ivory" : "border border-line")}>النشطة</Link>
        <Link href={qs({ view: "archived" })} className={cn("rounded px-3 py-1.5", archived ? "bg-forest text-ivory" : "border border-line")}>الأرشيف</Link>
        <span className="mx-1 border-s border-line" />
        <Link href={qs({ layout: "" })} className={cn("rounded px-3 py-1.5", !board ? "bg-forest text-ivory" : "border border-line")}>جدول</Link>
        <Link href={qs({ layout: "board" })} className={cn("rounded px-3 py-1.5", board ? "bg-forest text-ivory" : "border border-line")}>لوحة</Link>
        <Link href={qs({ overdue: sp.overdue === "1" ? "" : "1" })}
          className={cn("rounded px-3 py-1.5", sp.overdue === "1" ? "bg-st-late text-white" : "border border-line text-st-late")}>المتأخرة</Link>
      </div>

      <form role="search" className="flex flex-wrap gap-2">
        {archived ? <input type="hidden" name="view" value="archived" /> : null}
        {board ? <input type="hidden" name="layout" value="board" /> : null}
        {sp.overdue === "1" ? <input type="hidden" name="overdue" value="1" /> : null}
        <input name="q" defaultValue={sp.q ?? ""} placeholder="ابحث في العنوان" aria-label="بحث" className={cn(sel, "w-48")} />
        <select name="status" defaultValue={sp.status ?? ""} aria-label="الحالة" className={sel}>
          <option value="">كل الحالات</option>
          {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="committee" defaultValue={sp.committee ?? ""} aria-label="اللجنة" className={sel}>
          <option value="">كل اللجان</option>
          {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="priority" defaultValue={sp.priority ?? ""} aria-label="الأولوية" className={sel}>
          <option value="">كل الأولويات</option>
          {priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="assignee" defaultValue={sp.assignee ?? ""} aria-label="المسؤول" className={sel}>
          <option value="">كل المسؤولين</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="rounded border border-line px-4 py-2 text-sm text-forest hover:bg-ivory">تصفية</button>
      </form>

      {error ? <p role="alert" className="rounded bg-st-late/10 px-3 py-2 text-sm text-st-late">تعذّر تحميل المهام.</p> : null}

      {rows.length === 0 ? (
        <div className="border border-line bg-white"><EmptyState title="لا توجد مهام مطابقة." action={canCreate && !archived ? "أنشئ أول مهمة." : undefined} /></div>
      ) : board ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {Object.entries(TASK_STATUS).map(([status, st]) => {
            const col = rows.filter((r) => r.status === status);
            return (
              <section key={status} className="w-72 shrink-0 border border-line bg-white" aria-label={st.label}>
                <h2 className="flex items-center justify-between border-b border-line px-3 py-2 text-sm font-semibold text-forest">
                  {st.label}<span className="text-xs font-normal text-muted">{col.length}</span>
                </h2>
                <ul className="space-y-2 p-2">
                  {col.map((r) => (
                    <li key={r.id} className="border border-line bg-canvas p-3 text-sm">
                      <Link href={`/tasks/${r.id}`} className="font-medium text-forest hover:underline">{r.title}</Link>
                      <p className="mt-1 text-xs text-muted">{who(r)}</p>
                      <div className="mt-2"><ProgressBar value={r.progress} label={r.title} /></div>
                      {r.due_date ? <p className={cn("mt-1 text-xs", isLate(r) ? "text-st-late" : "text-muted")}>{formatDate(r.due_date)}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <Section title={archived ? "المهام المؤرشفة" : "المهام"} hint={`${rows.length} مهمة`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-line text-muted">
                <tr>{["المهمة", "المسؤول", "اللجنة / المشروع", "الأولوية", "الموعد", "الإنجاز", "الحالة"].map((h) => (
                  <th key={h} className="px-4 py-2 text-start font-medium">{h}</th>))}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const st = TASK_STATUS[r.status];
                  return (
                    <tr key={r.id} className="hover:bg-canvas">
                      <td className="px-4 py-3"><Link href={`/tasks/${r.id}`} className="font-medium text-forest hover:underline">{r.title}</Link></td>
                      <td className="px-4 py-3">{who(r)}</td>
                      <td className="px-4 py-3 text-muted">{r.projects?.name ?? r.committees?.name_ar ?? "—"}</td>
                      <td className="px-4 py-3">{r.task_priorities?.name_ar ?? "—"}</td>
                      <td className={cn("px-4 py-3 whitespace-nowrap", isLate(r) && "text-st-late")}>{r.due_date ? formatDate(r.due_date) : "—"}{isLate(r) ? " (متأخرة)" : ""}</td>
                      <td className="px-4 py-3 w-36"><ProgressBar value={r.progress} label={r.title} /></td>
                      <td className="px-4 py-3">{st ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : r.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
