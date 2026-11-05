import { ActionForm, Field } from "@/components/ui/action-form";
import { Section } from "@/components/ui/section";
import { requireSession } from "@/lib/auth/session";
import { changeOwnPassword } from "../users/actions";

export const metadata = { title: "حسابي" };

export default async function AccountPage() {
  const ctx = await requireSession();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-forest">حسابي</h1>
        <p className="mt-1 text-sm text-muted">{ctx.fullName}{ctx.email ? ` — ${ctx.email}` : ""}</p>
      </div>
      <Section title="تغيير كلمة المرور">
        <div className="px-4 py-4">
          <ActionForm action={changeOwnPassword} submitLabel="تغيير كلمة المرور">
            <Field label="كلمة المرور الجديدة" name="password" type="password" dir="ltr" required autoComplete="new-password" />
            <Field label="تأكيد كلمة المرور" name="confirm" type="password" dir="ltr" required autoComplete="new-password" />
          </ActionForm>
        </div>
      </Section>
    </div>
  );
}
