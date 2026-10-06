import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/redirect";
export async function GET(request: Request) {
  const url = new URL(request.url);
  let verified = false;
  try {
    const supabase = await createClient();
    const code = url.searchParams.get("code");
    const token_hash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");
    if (code) verified = !(await supabase.auth.exchangeCodeForSession(code)).error;
    else if (token_hash && (type === "signup" || type === "magiclink" || type === "email")) verified = !(await supabase.auth.verifyOtp({ token_hash, type })).error;
  } catch { /* Never echo provider errors or tokens. */ }
  const origin = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  return NextResponse.redirect(new URL(verified ? safeNext(url.searchParams.get("next")) : "/login?error=callback", origin));
}
