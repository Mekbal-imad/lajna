import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState, Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, requirePermission } from "@/lib/auth/session";
import { getCommittees } from "@/lib/data/lookups";
import { formatDate } from "@/lib/datetime";
import { DECISION_STATUS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "القرارات" };

type Row = {
  id: string; number: string; title: string; status: string; due_date: string | null;
  meetings: { title: string } | null; committees: { name_ar: string } | null;
};
type Search = { q?: string; status?: string; committee?: string; view?: string };
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requirePermission("decisions.view");
  const sp = await searchParams;
  const archived = sp.view === "archived";

  const supabase = await createClient();
  let query = supabase
    .from("decisions")
    .select("id, number, title, status, due_date, meetings(title), committees(name_ar)")
    .order("number", { ascending: false }).limit(200);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (sp.q?.trim()) query = query.or(`title.ilike.%${escapeLike(sp.q.trim()).replace(/[,()]/g, " ")}%,number.ilike.%${escapeLike(sp.q.trim()).replace(/[,()]/g, " ")}%`);
  if (sp.status && sp.status in DECISION_STATUS) query = query.eq("status", sp.status);
  if (sp.committee && /^[0-9a-f-]{36}$/i.test(sp.committee)) query = query.eq("committee_id", sp.committee);

  const [{ data, error }, committees] = await Promise.all([query, getCommittees()]);
  const rows = (data ?? []) as unknown as Row[];
  const today = new Date().toISOString().slice(0, 10);
  const sel = "rounded border border-line bg-white px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-forest">القرارات والتوصيات</h1>
          <p className="mt-1 text-sm text-muted">قرارات اللجنة ومتابعة تنفيذها.</p>
        </div>
        {can(ctx, "decisions.manage") ? (
          <Link href="/decisions/new" className="flex items-center gap-2 rounded bg-forest px-4 py-2 text-sm text-ivory hover:bg-forest-700">
            <Plus size={16} /> قرار جديد
          </Link>
        ) : null}
      </div>

      <nav className="flex gap-2 text-sm" aria-label="العرض">
        <Link href="/decisions" className={cn("rounded px-3 py-1.5", !archived ? "bg-forest text-ivory" : "border border-line")}>النشطة</Link>
        <Link href="/decisions?view=archived" className={cn("rounded px-3 py-1.5", archived ? "bg-forest text-ivory" : "border border-line")}>الأرشيف</Link>
      </nav>

      <form role="search" className="flex flex-wrap gap-2">
        {archived ? <input type="hidden" name="view" value="archived" /> : null}
        <input name="q" defaultValue={sp.q ?? ""} placeholder="العنوان أو الرقم" aria-label="بحث" className={cn(sel, "w-56")} />
        <select name="status" defaultValue={sp.status ?? ""} aria-label="الحالة" className={sel}>
          <option value="">كل الحالات</option>
          {Object.entries(DECISION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="committee" defaultValue={sp.committee ?? ""} aria-label="الجهة" className={sel}>
          <option value="">كل الجهات</option>
          {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="rounded border border-line px-4 py-2 text-sm text-forest hover:bg-ivory">تصفية</button>
      </form>

      {error ? <p role="alert" className="rounded bg-st-late/10 px-3 py-2 text-sm text-st-late">تعذّر تحميل القرارات.</p> : null}

      <Section title={archived ? "القرارات المؤرشفة" : "القرارات"} hint={`${rows.length} قرار`}>
        {rows.length === 0 ? (
          <EmptyState title="لا توجد قرارات مطابقة."
            action={!archived && can(ctx, "decisions.manage") ? "سجّل أول قرار." : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b border-line text-muted">
                <tr>{["الرقم", "العنوان", "الاجتماع", "الجهة", "الاستحقاق", "الحالة"].map((h) => (
                  <th key={h} className="px-4 py-2 text-start font-medium">{h}</th>))}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((d) => {
                  const st = DECISION_STATUS[d.status];
                  const late = d.due_date && d.due_date < today && ["approved", "in_progress"].includes(d.status);
                  return (
                    <tr key={d.id} className="hover:bg-canvas">
                      <td className="px-4 py-3 text-xs text-muted" dir="ltr">{d.number}</td>
                      <td className="px-4 py-3"><Link href={`/decisions/${d.id}`} className="font-medium text-forest hover:underline">{d.title}</Link></td>
                      <td className="px-4 py-3">{d.meetings?.title ?? <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3">{d.committees?.name_ar ?? <span className="text-muted">—</span>}</td>
                      <td className={cn("px-4 py-3 whitespace-nowrap", late && "text-st-late")}>{d.due_date ? formatDate(d.due_date) : "—"}</td>
                      <td className="px-4 py-3">{st ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : d.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
