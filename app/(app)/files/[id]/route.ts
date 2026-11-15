import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Authorised by RLS on `attachments` (the user's own client); the file itself is then served
// through a 60-second signed URL. Storage has no direct-access policies.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase.from("attachments").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!data) return new NextResponse("Not found", { status: 404 });

  const { data: signed, error } = await createAdminClient()
    .storage.from("attachments")
    .createSignedUrl(data.storage_path as string, 60, { download: data.file_name as string });
  if (error || !signed) return new NextResponse("Unavailable", { status: 502 });
  return NextResponse.redirect(signed.signedUrl);
}
