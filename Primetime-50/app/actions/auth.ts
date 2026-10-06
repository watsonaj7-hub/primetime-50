"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/redirect";
import { AppError } from "@/lib/http/errors";
import { type MutationState } from "@/lib/types/mutation";

const emailSchema = z.string().trim().email("Enter a valid email address.").max(254);
function appUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL;
  if (!value) throw new AppError(503, "Account services are not configured. Please contact the site owner.");
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new AppError(503, "Account services are not configured.");
  return url.origin;
}
function failure(error: unknown): MutationState {
  if (error instanceof z.ZodError) return { status: "error", message: "Please check your entries.", fields: error.flatten().fieldErrors };
  return { status: "error", message: error instanceof AppError ? error.message : "Account services are unavailable. Please try again." };
}
export async function login(_state: MutationState, form: FormData): Promise<MutationState> {
  let destination: string | undefined;
  try {
    const email = emailSchema.parse(form.get("email"));
    const supabase = await createClient();
    const next = safeNext(form.get("next"));
    if (form.get("intent") === "magic_link") {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}` } });
      if (error?.status === 429) throw new AppError(429, "Too many requests. Please wait before requesting another link.");
      if (error && error.status && error.status >= 500) throw new AppError(503, "Email delivery is unavailable. Please try again.");
      return { status: "success", message: "If an account exists for this email, a sign-in link has been sent." };
    }
    const password = z.string().min(1, "Enter your password.").max(128).parse(form.get("password"));
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { status: "error", message: "Sign-in failed. Check your email, password and email confirmation, then try again." };
    destination = next;
  } catch (error) { return failure(error); }
  redirect(destination!);
}
export async function register(_state: MutationState, form: FormData): Promise<MutationState> {
  let authenticated = false;
  try {
    const values = z.object({ email: emailSchema, password: z.string().min(12, "Use at least 12 characters.").max(128), confirmation: z.string() }).refine(v => v.password === v.confirmation, { path: ["confirmation"], message: "Passwords do not match." }).parse(Object.fromEntries(["email", "password", "confirmation"].map(key => [key, form.get(key)])));
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({ email: values.email, password: values.password, options: { emailRedirectTo: `${appUrl()}/auth/callback?next=/onboarding` } });
    if (error) return { status: "error", message: "Registration could not be completed. Please try again or sign in if you already have an account." };
    authenticated = !!data.session;
  } catch (error) { return failure(error); }
  if (authenticated) redirect("/onboarding");
  return { status: "success", message: "Check your email to confirm your account, then sign in." };
}
export async function logout(_state: MutationState): Promise<MutationState> {
  void _state;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return { status: "error", message: "Sign-out failed. Please try again." };
  } catch (error) { return failure(error); }
  redirect("/login");
}
