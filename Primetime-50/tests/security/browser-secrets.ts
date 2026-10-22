// Return labels only: bundle contents and configured values must never reach a reporter.
export const privateNames = [
  "PRIMEFIT_AI_KEY", "OPENAI_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"
] as const;

export function privateReferences(source: string, environment: Record<string, string | undefined>): string[] {
  return privateNames.filter(name => {
    const value = environment[name];
    return source.includes(name) || Boolean(value && (
      source.includes(value) || source.includes(JSON.stringify(value).slice(1, -1))
    ));
  });
}
