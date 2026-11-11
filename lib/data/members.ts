import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;
export type Member = { id: string; name: string; active: boolean };

/**
 * Names of all members. Reads the names-only view `member_directory` (so every signed-in member
 * can see who attended) and falls back to `profiles` (users.view only) until that view is installed.
 */
export async function loadMembers(supabase: Db): Promise<Member[]> {
  const dir = await supabase.from("member_directory").select("id, full_name, is_active").order("full_name");
  const rows = !dir.error
    ? dir.data
    : (await supabase.from("profiles").select("id, full_name, is_active").order("full_name")).data;
  return ((rows ?? []) as { id: string; full_name: string; is_active: boolean }[]).map((r) => ({
    id: r.id, name: r.full_name, active: r.is_active,
  }));
}
