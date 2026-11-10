import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState, Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, requirePermission } from "@/lib/auth/session";
import { getCommittees, getMeetingTypes } from "@/lib/data/lookups";
import { formatDateTime } from "@/lib/datetime";
import { MEETING_STATUS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "الاجتماعات" };

type Row = {
  id: string; title: string; scheduled_at: string; location: string | null; status: string;
  meeting_types: { name_ar: string } | null; committees: { name_ar: string } | null;
};
type Search = { q?: string; status?: string; type?: string; committee?: string; view?: string };
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const isUuid = (s?: string) => !!s && /^[0-9a-f-]{36}$/i.test(s);

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requirePermission("meetings.view");
  const sp = await searchParams;
  const archived = sp.view === "archived";

  const supabase = await createClient();
  let query = supabase
    .from("meetings")
    .select("id, title, scheduled_at, location, status, meeting_types(name_ar), committees(name_ar)")
    .order("scheduled_at", { ascending: false }).limit(200);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (sp.q?.trim()) query = query.ilike("title", `%${escapeLike(sp.q.trim())}%`);
  if (sp.status && sp.status in MEETING_STATUS) query = query.eq("status", sp.status);
  if (isUuid(sp.type)) query = query.eq("meeting_type_id", sp.type!);
  if (isUuid(sp.committee)) query = query.eq("committee_id", sp.committee!);

  const [{ data, error }, types, committees] = await Promise.all([query, getMeetingTypes(true), getCommittees()]);
  const rows = (data ?? []) as unknown as Row[];
  const canCreate = can(ctx, "meetings.manage") || can(ctx, "meetings.manage_committee");
  const sel = "rounded border border-line bg-white px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-forest">الاجتماعات</h1>
          <p className="mt-1 text-sm text-muted">اجتماعات اللجنة وحضورها ومحاضرها.</p>
        </div>
        {canCreate ? (
          <Link href="/meetings/new" className="flex items-center gap-2 rounded bg-forest px-4 py-2 text-sm text-ivory hover:bg-forest-700">
            <Plus size={16} /> اجتماع جديد
          </Link>
        ) : null}
      </div>

      <nav className="flex gap-2 text-sm" aria-label="العرض">
        <Link href="/meetings" className={cn("rounded px-3 py-1.5", !archived ? "bg-forest text-ivory" : "border border-line")}>النشطة</Link>
        <Link href="/meetings?view=archived" className={cn("rounded px-3 py-1.5", archived ? "bg-forest text-ivory" : "border border-line")}>الأرشيف</Link>
      </nav>

      <form role="search" className="flex flex-wrap gap-2">
        {archived ? <input type="hidden" name="view" value="archived" /> : null}
        <input name="q" defaultValue={sp.q ?? ""} placeholder="ابحث في العنوان" aria-label="بحث" className={cn(sel, "w-56")} />
        <select name="status" defaultValue={sp.status ?? ""} aria-label="الحالة" className={sel}>
          <option value="">كل الحالات</option>
          {Object.entries(MEETING_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="type" defaultValue={sp.type ?? ""} aria-label="النوع" className={sel}>
          <option value="">كل الأنواع</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select name="committee" defaultValue={sp.committee ?? ""} aria-label="اللجنة" className={sel}>
          <option value="">كل اللجان</option>
          {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="rounded border border-line px-4 py-2 text-sm text-forest hover:bg-ivory">تصفية</button>
      </form>

      {error ? <p role="alert" className="rounded bg-st-late/10 px-3 py-2 text-sm text-st-late">تعذّر تحميل الاجتماعات.</p> : null}

      <Section title={archived ? "الاجتماعات المؤرشفة" : "الاجتماعات"} hint={`${rows.length} اجتماع`}>
        {rows.length === 0 ? (
          <EmptyState
            title={archived ? "لا توجد اجتماعات مؤرشفة." : "لا توجد اجتماعات مطابقة."}
            action={!archived && canCreate ? "ابدأ بإنشاء اجتماع جديد." : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  {["العنوان", "الموعد", "النوع", "اللجنة", "الحالة"].map((h) => (
                    <th key={h} className="px-4 py-2 text-start font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((m) => {
                  const st = MEETING_STATUS[m.status];
                  return (
                    <tr key={m.id} className="hover:bg-canvas">
                      <td className="px-4 py-3"><Link href={`/meetings/${m.id}`} className="font-medium text-forest hover:underline">{m.title}</Link></td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(m.scheduled_at)}</td>
                      <td className="px-4 py-3">{m.meeting_types?.name_ar ?? <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3">{m.committees?.name_ar ?? "اللجنة كاملة"}</td>
                      <td className="px-4 py-3">{st ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : m.status}</td>
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
