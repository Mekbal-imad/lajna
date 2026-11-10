import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Option = { id: string; name: string };

export async function getDirectory(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("member_directory").select("id, full_name");
  return new Map((data ?? []).map((r: { id: string; full_name: string }) => [r.id, r.full_name]));
}

export async function getActiveMembers(): Promise<Option[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("member_directory").select("id, full_name").eq("is_active", true).order("full_name");
  return (data ?? []).map((r: { id: string; full_name: string }) => ({ id: r.id, name: r.full_name }));
}

export async function getCommittees(): Promise<Option[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("committees").select("id, name_ar").eq("is_active", true).order("name_ar");
  return (data ?? []).map((r: { id: string; name_ar: string }) => ({ id: r.id, name: r.name_ar }));
}

export async function getMeetingTypes(includeInactive = false): Promise<(Option & { active: boolean; sort: number })[]> {
  const supabase = await createClient();
  let q = supabase.from("meeting_types").select("id, name_ar, is_active, sort_order").order("sort_order").order("name_ar");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  return (data ?? []).map((r: { id: string; name_ar: string; is_active: boolean; sort_order: number }) => ({
    id: r.id, name: r.name_ar, active: r.is_active, sort: r.sort_order,
  }));
}

type LookupRow = { id: string; name_ar: string; is_active: boolean; sort_order: number };

async function getLookup(table: "task_priorities" | "project_categories", includeInactive: boolean) {
  const supabase = await createClient();
  let q = supabase.from(table).select("id, name_ar, is_active, sort_order").order("sort_order").order("name_ar");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  return ((data ?? []) as LookupRow[]).map((r) => ({ id: r.id, name: r.name_ar, active: r.is_active, sort: r.sort_order }));
}
export const getPriorities = (includeInactive = false) => getLookup("task_priorities", includeInactive);
export const getCategories = (includeInactive = false) => getLookup("project_categories", includeInactive);
