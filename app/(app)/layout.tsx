import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/env";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseEnv) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <p role="alert" className="rounded border border-gold bg-ivory px-4 py-4 text-sm">
          لم يُضبط الاتصال بـ Supabase بعد. انسخ <code dir="ltr">.env.example</code> إلى{" "}
          <code dir="ltr">.env.local</code> وأدخل القيم، ثم أعد تشغيل الخادم.
        </p>
      </main>
    );
  }

  const ctx = await getSessionContext();
  if (!ctx) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    redirect(user ? "/auth/inactive" : "/login");
  }

  return (
    <AppShell userName={ctx.fullName} permissions={ctx.permissions}>
      {children}
    </AppShell>
  );
}
