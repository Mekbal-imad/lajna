import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Signs out a disabled (or profile-less) account, then returns to the login page.
// Done in a route handler because Server Components cannot write cookies.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login?error=inactive", request.url));
}
