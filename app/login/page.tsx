import { hasSupabaseEnv } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="flex flex-col justify-between border-e border-line bg-ivory px-8 py-10 text-forest">
        <p className="font-display text-lg font-bold">لجنة التنظيم والصيانة والنظافة</p>
        <blockquote className="max-w-md py-10 font-display text-2xl font-semibold leading-relaxed lg:text-3xl">
          كل اجتماع موثق، وكل قرار محفوظ، وكل مهمة لها مسؤول وأجل.
        </blockquote>
        <p className="text-sm text-muted">مدرسة قرآنية ومسجد</p>
      </section>

      <section className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <h1 className="mb-1 text-2xl font-bold text-forest">تسجيل الدخول</h1>
          <p className="mb-6 text-sm text-muted">الحسابات يُنشئها مدير النظام. إن لم يكن لديك حساب فتواصل مع اللجنة.</p>
          {error === "inactive" ? (
            <p role="alert" className="mb-4 rounded bg-st-late/10 px-3 py-2 text-sm text-st-late">
              هذا الحساب معطّل. تواصل مع مدير النظام.
            </p>
          ) : null}
          {hasSupabaseEnv ? (
            <LoginForm />
          ) : (
            <p role="alert" className="rounded border border-gold bg-ivory px-3 py-3 text-sm">
              لم يُضبط الاتصال بـ Supabase بعد. انسخ <code dir="ltr">.env.example</code> إلى{" "}
              <code dir="ltr">.env.local</code> وأدخل القيم.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
