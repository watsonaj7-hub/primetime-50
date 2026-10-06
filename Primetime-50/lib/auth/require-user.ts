import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/http/errors";

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new AppError(401, "Please sign in to continue.");
  return { supabase, user };
}
