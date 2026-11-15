import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/section";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, requirePermission } from "@/lib/auth/session";
import { getCategories, getCommittees } from "@/lib/data/lookups";
import { formatDate } from "@/lib/datetime";
import { PROJECT_STATUS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "المشاريع السنوية" };

type Row = {
  id: string; name: string; status: string; start_date: string | null; end_date: string | null;
  committees: { name_ar: string } | null; project_categories: { name_ar: string } | null;
};
type Search = { q?: string; status?: string; committee?: string; category?: string; year?: string; view?: string };
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const isUuid = (s?: string) => !!s && /^[0-9a-f-]{36}$/i.test(s);

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requirePermission("projects.view");
  const sp = await searchParams;
  const archived = sp.view === "archived";

  const supabase = await createClient();
  let query = supabase.from("projects")
    .select("id, name, status, start_date, end_date, committees(name_ar), project_categories:category_id(name_ar)")
    .order("created_at", { ascending: false }).limit(200);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (sp.q?.trim()) query = query.ilike("name", `%${escapeLike(sp.q.trim())}%`);
  if (sp.status && sp.status in PROJECT_STATUS) query = query.eq("status", sp.status);
  if (isUuid(sp.committee)) query = query.eq("committee_id", sp.committee!);
  if (isUuid(sp.category)) query = query.eq("category_id", sp.category!);
  if (sp.year && /^\d{4}$/.test(sp.year)) query = query.gte("start_date", `${sp.year}-01-01`).lte("start_date", `${sp.year}-12-31`);

  const [{ data, error }, committees, categories] = await Promise.all([query, getCommittees(), getCategories(true)]);
  const rows = (data ?? []) as unknown as Row[];
  const progRes = rows.length ? await supabase.from("project_progress").select("project_id, progress, task_count").in("project_id", rows.map((r) => r.id)) : { data: [] };
  const prog = new Map(((progRes.data ?? []) as { project_id: string; progress: number; task_count: number }[]).map((r) => [r.project_id, r]));
  const canCreate = can(ctx, "projects.manage") || can(ctx, "projects.manage_committee");
  const sel = "rounded border border-line bg-white px-3 py-2 text-sm";
  const thisYear = new Date().getFullYear();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-forest">المشاريع السنوية</h1>
          <p className="mt-1 text-sm text-muted">تتقدم نسبة كل مشروع تلقائيًا من مهامه وأوزانها.</p>
        </div>
        {canCreate ? (
          <Link href="/projects/new" className="flex items-center gap-2 rounded bg-forest px-4 py-2 text-sm text-ivory hover:bg-forest-700">
            <Plus size={16} /> مشروع جديد
          </Link>
        ) : null}
      </div>

      <nav className="flex gap-2 text-sm" aria-label="العرض">
        <Link href="/projects" className={cn("rounded px-3 py-1.5", !archived ? "bg-forest text-ivory" : "border border-line")}>النشطة</Link>
        <Link href="/projects?view=archived" className={cn("rounded px-3 py-1.5", archived ? "bg-forest text-ivory" : "border border-line")}>الأرشيف</Link>
      </nav>

      <form role="search" className="flex flex-wrap gap-2">
        {archived ? <input type="hidden" name="view" value="archived" /> : null}
        <input name="q" defaultValue={sp.q ?? ""} placeholder="ابحث في الاسم" aria-label="بحث" className={cn(sel, "w-48")} />
        <select name="status" defaultValue={sp.status ?? ""} aria-label="الحالة" className={sel}>
          <option value="">كل الحالات</option>
          {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="committee" defaultValue={sp.committee ?? ""} aria-label="اللجنة" className={sel}>
          <option value="">كل اللجان</option>
          {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="category" defaultValue={sp.category ?? ""} aria-label="التصنيف" className={sel}>
          <option value="">كل التصنيفات</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="year" defaultValue={sp.year ?? ""} aria-label="السنة" className={sel}>
          <option value="">كل السنوات</option>
          {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className="rounded border border-line px-4 py-2 text-sm text-forest hover:bg-ivory">تصفية</button>
      </form>

      {error ? <p role="alert" className="rounded bg-st-late/10 px-3 py-2 text-sm text-st-late">تعذّر تحميل المشاريع.</p> : null}

      {rows.length === 0 ? (
        <div className="border border-line bg-white"><EmptyState title={archived ? "لا توجد مشاريع مؤرشفة." : "لا توجد مشاريع مطابقة."} action={canCreate && !archived ? "أنشئ أول مشروع." : undefined} /></div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => {
            const st = PROJECT_STATUS[r.status];
            const p = prog.get(r.id);
            return (
              <li key={r.id} className="space-y-3 border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/projects/${r.id}`} className="font-display text-lg font-semibold text-forest hover:underline">{r.name}</Link>
                  {st ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : null}
                </div>
                <p className="text-sm text-muted">
                  {[r.committees?.name_ar, r.project_categories?.name_ar,
                    r.start_date ? `${formatDate(r.start_date)}${r.end_date ? ` → ${formatDate(r.end_date)}` : ""}` : null].filter(Boolean).join(" · ") || "—"}
                </p>
                <ProgressBar value={Number(p?.progress ?? 0)} label={r.name} />
                <p className="text-xs text-muted">{p?.task_count ?? 0} مهمة</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
