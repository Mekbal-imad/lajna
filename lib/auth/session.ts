import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionContext = {
  userId: string;
  email: string | null;
  fullName: string;
  permissions: string[];
};

/** Current user + permissions, or null when signed out / inactive. Cached per request. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, permsRes] = await Promise.all([
    supabase.from("profiles").select("full_name, is_active").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_permissions"),
  ]);
  const profile = profileRes.data;
  if (!profile || !profile.is_active) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    fullName: profile.full_name,
    permissions: (permsRes.data as string[] | null) ?? [],
  };
});

export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Page guard. UI hiding is only convenience; RLS is what actually protects the data. */
export async function requirePermission(code: string): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!ctx.permissions.includes(code)) redirect("/forbidden");
  return ctx;
}

export function can(ctx: SessionContext, code: string) {
  return ctx.permissions.includes(code);
}
