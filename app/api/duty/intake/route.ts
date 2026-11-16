import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { intakeSchema, parseDutyReport } from "@/lib/duty";

export const runtime = "nodejs";

function secretMatches(given: string | null): boolean {
  const expected = process.env.SUBMISSIONS_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Receives one duty-form response (sent by the Apps Script in docs/google-duty-script.gs).
 * Not behind a login: protected by the shared secret in the `x-intake-secret` header.
 * Idempotent: the form response id is unique, so a retry never creates a duplicate.
 */
export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get("x-intake-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const text = await req.text();
  if (text.length > 200_000) return NextResponse.json({ error: "too large" }, { status: 413 });

  let json: unknown;
  try { json = JSON.parse(text); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const payload = intakeSchema.safeParse(json);
  if (!payload.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });

  const parsed = parseDutyReport(payload.data);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const { data, error } = await createAdminClient()
    .from("duty_reports")
    .upsert(parsed.row, { onConflict: "external_id", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("duty report intake failed", error.message);
    return NextResponse.json({ error: "storage failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, created: (data?.length ?? 0) > 0, id: data?.[0]?.id ?? null });
}
