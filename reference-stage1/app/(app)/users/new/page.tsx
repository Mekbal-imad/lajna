import Link from "next/link";
import { ActionForm, Field } from "@/components/ui/action-form";
import { Section } from "@/components/ui/section";
import { can, requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createUser } from "../actions";

export const metadata = { title: "إضافة مستخدم" };

export default async function NewUserPage() {
  const ctx = await requirePermission("users.manage");
  const canAssign = can(ctx, "roles.assign");

  const supabase = await createClient();
  const { data: roles } = canAssign
    ? await supabase.from("roles").select("id, code, name_ar").order("name_ar")
    : { data: [] as { id: string; code: string; name_ar: string }[] };
  const isSuper = can(ctx, "roles.manage");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/users" className="text-sm text-muted hover:text-forest">← المستخدمون</Link>
        <h1 className="mt-1 text-2xl font-bold text-forest">إضافة مستخدم</h1>
      </div>
      <Section title="بيانات الحساب">
        <div className="px-4 py-4">
          <ActionForm action={createUser} submitLabel="إنشاء الحساب" pendingLabel="جارٍ الإنشاء…">
            <Field label="الاسم الكامل" name="fullName" required />
            <Field label="البريد الإلكتروني" name="email" type="email" dir="ltr" required autoComplete="off" />
            <Field label="كلمة المرور المؤقتة" name="password" type="password" dir="ltr" required autoComplete="new-password"
              hint="10 أحرف على الأقل. سلّمها للمستخدم بطريقة آمنة، وليغيّرها بعد أول دخول." />
            <Field label="الهاتف (اختياري)" name="phone" dir="ltr" />
            {canAssign ? (
              <div>
                <label htmlFor="roleId" className="mb-1 block text-sm font-medium">الدور (اختياري)</label>
                <select id="roleId" name="roleId" defaultValue="" className="w-full rounded border border-line bg-white px-3 py-2 text-sm">
                  <option value="">بلا دور</option>
                  {(roles ?? [])
                    .filter((r) => isSuper || r.code !== "super_admin")
                    .map((r) => <option key={r.id} value={r.id}>{r.name_ar}</option>)}
                </select>
              </div>
            ) : null}
          </ActionForm>
        </div>
      </Section>
    </div>
  );
}
