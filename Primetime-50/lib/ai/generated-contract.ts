import { z } from 'zod';
const uuid = z.string().uuid();
const integer = z.number().int();
const weekRule = z.object({ catalogue_ids: z.array(uuid).min(1).max(20), min_sessions: integer.min(1).max(7), max_sessions: integer.min(1).max(7), rest_days: integer.min(0).max(6) }).strict();
export const trustedContextSchema = z.object({
  policy_version_id: uuid, context_revision: integer.nonnegative(), max_sessions: integer.min(1).max(7), session_minutes: integer.min(10).max(120),
  rules: z.object({ weeks: z.array(weekRule).min(1).max(4) }).strict(),
  catalogue: z.array(z.object({ id: uuid, session_minutes: integer.min(1).max(120) }).strict()).min(1).max(20)
}).strict().superRefine((c, ctx) => {
  if (new Set(c.catalogue.map(x => x.id)).size !== c.catalogue.length || c.catalogue.some(x => x.session_minutes > c.session_minutes) || c.rules.weeks.some(w => w.min_sessions > w.max_sessions || w.min_sessions > c.max_sessions || w.catalogue_ids.some(id => !c.catalogue.some(x => x.id === id)))) ctx.addIssue({ code:'custom', message:'Unsupported trusted context' });
});
export type TrustedContext = z.infer<typeof trustedContextSchema>;
export const generatedPlanSchema = z.object({
  policy_version_id: uuid, context_revision: integer.nonnegative(),
  weeks: z.array(z.object({ sessions: z.array(z.object({ day: integer.min(1).max(7), catalogue_version_id: uuid }).strict()).min(1).max(7) }).strict()).min(1).max(4)
}).strict();
export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;
export function validateGeneratedPlan(value: unknown, context: TrustedContext): GeneratedPlan {
  const plan = generatedPlanSchema.parse(value);
  if (plan.policy_version_id !== context.policy_version_id || plan.context_revision !== context.context_revision || plan.weeks.length !== context.rules.weeks.length) throw new Error('Context mismatch');
  let lastDay: number | undefined;
  let previousRest = 0;
  plan.weeks.forEach((week, index) => {
    const rule = context.rules.weeks[index];
    if (week.sessions.length < rule.min_sessions || week.sessions.length > Math.min(rule.max_sessions, context.max_sessions)) throw new Error('Frequency mismatch');
    week.sessions.forEach(session => {
      const absoluteDay = index * 7 + session.day;
      if (!rule.catalogue_ids.includes(session.catalogue_version_id) || (lastDay !== undefined && absoluteDay - lastDay <= Math.max(previousRest, rule.rest_days))) throw new Error('Unapproved progression or rest interval');
      lastDay = absoluteDay;
      previousRest = rule.rest_days;
    });
  });
  return plan;
}
