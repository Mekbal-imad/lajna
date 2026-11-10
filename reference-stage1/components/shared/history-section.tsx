import { Section } from "@/components/ui/section";
import { formatDateTime } from "@/lib/datetime";
import { getDirectory } from "@/lib/data/lookups";
import { FIELD_LABELS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string; op: "INSERT" | "UPDATE" | "DELETE"; changed_by: string | null; changed_at: string;
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
};

const IGNORED = new Set(["updated_at", "created_at", "id", "minutes_approved_by", "archived_by"]);

function summarize(r: Row): string {
  if (r.op === "INSERT") return "إنشاء";
  if (r.op === "DELETE") return "حذف";
  const keys = Object.keys(r.new_data ?? {}).filter(
    (k) => !IGNORED.has(k) && JSON.stringify(r.new_data?.[k]) !== JSON.stringify(r.old_data?.[k]),
  );
  return keys.length ? `تعديل: ${keys.map((k) => FIELD_LABELS[k] ?? k).join("، ")}` : "تعديل";
}

/** Shows the change history; RLS decides whether the current user sees any rows at all. */
export async function HistorySection({ table, rowId }: { table: "meetings" | "decisions" | "committees" | "tasks" | "projects"; rowId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("change_history").select("id, op, changed_by, changed_at, old_data, new_data")
    .eq("table_name", table).eq("row_id", rowId).order("changed_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return null;
  const names = await getDirectory();

  return (
    <Section title="سجل التعديلات" hint="من عدّل وماذا وفي أي وقت">
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-3 text-sm">
            <p>{summarize(r)}</p>
            <p className="text-xs text-muted">
              {r.changed_by ? names.get(r.changed_by) ?? "مستخدم" : "النظام"} · {formatDateTime(r.changed_at)}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
