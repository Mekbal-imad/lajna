import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/lib/auth/session";

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Can this user manage attendance of this meeting?
 * - meetings.manage: any meeting.
 * - meetings.manage_committee: only the meeting of the committee they head (decided by the database
 *   function can_manage_meeting, added by migration B). If that function is not installed yet, false.
 * UI hiding is convenience only: RLS decides what is actually written.
 */
export async function canManageAttendance(supabase: Db, ctx: SessionContext, meetingId: string): Promise<boolean> {
  if (ctx.permissions.includes("meetings.manage")) return true;
  if (!ctx.permissions.includes("meetings.manage_committee")) return false;
  const { data, error } = await supabase.rpc("can_manage_meeting", { p_meeting: meetingId });
  return !error && data === true;
}
