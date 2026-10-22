import "server-only";
import { requireUser } from "@/lib/auth/require-user";
import { draftSchema, type OnboardingDraft } from "@/lib/validation/draft";
import { AppError } from "@/lib/http/errors";
export async function readDraft(): Promise<OnboardingDraft | null> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("onboarding_drafts").select("draft_json").eq("user_id", user.id).maybeSingle();
  if (error) throw new AppError(503, "Your draft could not be loaded. Please try again.");
  if (!data) return null;
  const result = draftSchema.safeParse(data.draft_json);
  return result.success ? result.data : null;
}
export async function saveDraft(input: unknown) {
  const { supabase, user } = await requireUser();
  const draft = draftSchema.parse(input);
  const { error } = await supabase.from("onboarding_drafts").upsert({ user_id: user.id, draft_json: draft });
  if (error?.code === "55000") throw new AppError(409, "Your profile is already complete. This draft was not saved. Use Settings to make changes.");
  if (error) throw new AppError(503, "Your draft was not saved. Please try again.");
}
