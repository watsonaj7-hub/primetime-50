import { z } from "zod";
import { nutritionEntry, nutritionQuery, type NutritionEntry } from "@/lib/validation/nutrition";
export function totals(entries: NutritionEntry[]) {
 return entries.reduce((sum,e) => ({ protein_tenths:sum.protein_tenths+(e.protein_tenths ?? 0), water_ml:sum.water_ml+(e.water_ml ?? 0) }), {protein_tenths:0,water_ml:0});
}
const dayResponse = nutritionQuery.extend({ entries:z.array(nutritionEntry), totals:z.object({protein_tenths:z.number().int().nonnegative().safe(),water_ml:z.number().int().nonnegative().safe()}).strict() }).strict();
export type NutritionDay = z.infer<typeof dayResponse>;
export function decodeDay(raw:unknown, day:string, timezone:string):NutritionDay {
 const parsed=dayResponse.parse(raw), sums=totals(parsed.entries);
 if(parsed.day!==day || parsed.timezone!==timezone || new Set(parsed.entries.map(e=>e.id)).size!==parsed.entries.length || parsed.entries.some(e=>e.logged_on!==day || e.timezone!==timezone) || sums.protein_tenths!==parsed.totals.protein_tenths || sums.water_ml!==parsed.totals.water_ml) throw new Error("Saved entries and totals could not be reconciled. Reload this day.");
 return parsed;
}
export function dateInZone(now:Date, timezone:string) {
 const parts=new Intl.DateTimeFormat("en",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 return ["year","month","day"].map(k=>parts.find(p=>p.type===k)!.value).join("-");
}
export function proteinTenths(raw:string) {
 if(!/^\d+(\.\d)?$/.test(raw.trim()))throw new Error("Protein must be grams with at most one decimal place, including zero.");
 const [whole,decimal="0"]=raw.trim().split("."); const value=Number(whole)*10+Number(decimal);
 if(!Number.isSafeInteger(value)||value>100000)throw new Error("Protein is outside the supported recording range (0–10000 g).");
 return value;
}
export function waterMl(raw:string) {
 if(!/^\d+$/.test(raw.trim()))throw new Error("Water must be a whole number of mL.");
 const value=Number(raw.trim());if(!Number.isSafeInteger(value)||value<1||value>100000)throw new Error("Water is outside the supported recording range (1–100000 mL).");return value;
}
