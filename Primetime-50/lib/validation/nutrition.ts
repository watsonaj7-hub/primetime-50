import { z } from "zod";
export const nutritionId = z.string().uuid();
export const nutritionDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => s >= "1900-01-01" && s <= "2100-12-31" && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s, "Choose a valid calendar date from 1900 to 2100.");
export const nutritionZone = z.string().min(1).max(100).refine(s => { try { new Intl.DateTimeFormat("en", { timeZone:s }); return true; } catch { return false; } }, "Choose an IANA timezone, for example Australia/Melbourne.");
export const nutritionQuery = z.object({ day:nutritionDay, timezone:nutritionZone }).strict();
const fields = { id:nutritionId, logged_on:nutritionDay, timezone:nutritionZone, revision:z.number().int().min(0).max(2147483646) };
export const nutritionEntry = z.discriminatedUnion("kind", [
 z.object({ ...fields, kind:z.literal("meal"), description:z.string().trim().min(1).max(300), protein_tenths:z.number().int().min(0).max(100000), water_ml:z.null() }).strict(),
 z.object({ ...fields, kind:z.literal("water"), description:z.null(), protein_tenths:z.null(), water_ml:z.number().int().min(1).max(100000) }).strict()
]);
export type NutritionEntry = z.infer<typeof nutritionEntry>;
// Integer tenths of a gram and whole mL keep storage and sums exact. Bounds are storage limits, not advice.
export const nutritionMutation = z.discriminatedUnion("action", [
 z.object({ action:z.literal("create"), mutation_id:nutritionId, entry:nutritionEntry }).strict(),
 z.object({ action:z.literal("update"), mutation_id:nutritionId, entry:nutritionEntry }).strict(),
 z.object({ action:z.literal("delete"), mutation_id:nutritionId, id:nutritionId, expected_revision:z.number().int().min(0).max(2147483646) }).strict()
]).refine(p => p.action !== "create" || p.entry.revision === 0, "New entries start at revision zero.");
export type NutritionMutation = z.infer<typeof nutritionMutation>;
