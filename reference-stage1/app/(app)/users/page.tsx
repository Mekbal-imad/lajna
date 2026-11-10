import Link from "next/link";
import { UserPlus } from "lucide-react";
import { EmptyState, Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/types";

export const metadata = { title: "المستخدمون" };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requirePermission("users.view");
  const { q } = await searchParams;
  const term = q?.trim() ?? "";

  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select("id, full_name, phone, is_active, user_roles(roles(code, name_ar)), committee_members(member_role, committees(id, name_ar))")
    .order("full_name");
  if (term) query = query.ilike("full_name", `%${escapeLike(term)}%`);

  const { data, error } = await query;
  const users = (data ?? []) as unknown as UserRow[];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-forest">المستخدمون</h1>
          <p className="mt-1 text-sm text-muted">حسابات أعضاء اللجنة وأدوارهم ولجانهم.</p>
        </div>
        {can(ctx, "users.manage") ? (
          <Link href="/users/new" className="flex items-center gap-2 rounded bg-forest px-4 py-2 text-sm text-ivory hover:bg-forest-700">
            <UserPlus size={16} />
            إضافة مستخدم
          </Link>
        ) : null}
      </div>

      <form role="search" className="flex gap-2">
        <input
          name="q" defaultValue={term} placeholder="ابحث بالاسم"
          aria-label="بحث بالاسم"
          className="w-full max-w-xs rounded border border-line bg-white px-3 py-2 text-sm"
        />
        <button className="rounded border border-line px-4 py-2 text-sm text-forest hover:bg-ivory">بحث</button>
      </form>

      {error ? (
        <p role="alert" className="rounded bg-st-late/10 px-3 py-2 text-sm text-st-late">تعذّر تحميل المستخدمين.</p>
      ) : null}

      <Section title="القائمة" hint={`${users.length} مستخدم`}>
        {users.length === 0 ? (
          <EmptyState
            title={term ? "لا توجد نتائج مطابقة للبحث." : "لا يوجد مستخدمون بعد."}
            action={!term && can(ctx, "users.manage") ? "ابدأ بإضافة مستخدم." : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line text-start text-muted">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">الاسم</th>
                  <th className="px-4 py-2 text-start font-medium">الأدوار</th>
                  <th className="px-4 py-2 text-start font-medium">اللجان</th>
                  <th className="px-4 py-2 text-start font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-canvas">
                    <td className="px-4 py-3">
                      <Link href={`/users/${u.id}`} className="font-medium text-forest hover:underline">{u.full_name}</Link>
                    </td>
                    <td className="px-4 py-3">
                      {u.user_roles.length === 0
                        ? <span className="text-muted">بلا دور</span>
                        : u.user_roles.map((r) => r.roles?.name_ar).filter(Boolean).join("، ")}
                    </td>
                    <td className="px-4 py-3">
                      {u.committee_members.length === 0
                        ? <span className="text-muted">—</span>
                        : u.committee_members.map((m) => m.committees?.name_ar).filter(Boolean).join("، ")}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={u.is_active ? "ok" : "idle"}>{u.is_active ? "نشط" : "معطّل"}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
