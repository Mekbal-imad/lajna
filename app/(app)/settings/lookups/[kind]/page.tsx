import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field, Select } from "@/components/ui/action-form";
import { Section } from "@/components/ui/section";
import { requirePermission } from "@/lib/auth/session";
import { LOOKUPS, type LookupKind } from "@/lib/lookups";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { saveLookup } from "../actions";

export const metadata = { title: "قوائم الإعدادات" };
const ACTIVE = [{ value: "true", label: "نشط" }, { value: "false", label: "معطّل" }];

export default async function LookupPage({ params }: { params: Promise<{ kind: string }> }) {
  await requirePermission("settings.manage");
  const { kind } = await params;
  if (!(kind in LOOKUPS)) notFound();
  const cfg = LOOKUPS[kind as LookupKind];

  const supabase = await createClient();
  const { data } = await supabase.from(cfg.table).select("id, name_ar, is_active, sort_order").order("sort_order").order("name_ar");
  const rows = (data ?? []) as { id: string; name_ar: string; is_active: boolean; sort_order: number }[];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-forest">قوائم الإعدادات</h1>
        <p className="mt-1 text-sm text-muted">هذه القوائم تُعدَّل من هنا دون تغيير الكود. التعطيل يخفي العنصر من الجديد ويُبقي القديم.</p>
      </div>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="القوائم">
        {(Object.keys(LOOKUPS) as LookupKind[]).map((k) => (
          <Link key={k} href={`/settings/lookups/${k}`}
            className={cn("rounded px-3 py-1.5", k === kind ? "bg-forest text-ivory" : "border border-line")}>
            {LOOKUPS[k].title}
          </Link>
        ))}
      </nav>
      <Section title={cfg.title} hint={cfg.hint}>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-4">
              <ActionForm action={saveLookup} submitLabel="حفظ" variant="quiet">
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="id" value={r.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="الاسم" name="name" defaultValue={r.name_ar} required />
                  <Field label="الترتيب" name="sort" type="number" dir="ltr" defaultValue={String(r.sort_order)} />
                  <Select label="الحالة" name="active" defaultValue={r.is_active ? "true" : "false"} options={ACTIVE} />
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="إضافة عنصر">
        <div className="px-4 py-4">
          <ActionForm action={saveLookup} submitLabel="إضافة">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="active" value="true" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الاسم" name="name" required />
              <Field label="الترتيب" name="sort" type="number" dir="ltr" defaultValue="0" />
            </div>
          </ActionForm>
        </div>
      </Section>
    </div>
  );
}
