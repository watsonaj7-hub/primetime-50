import { expect,it } from "vitest";
import { nutritionMutation, nutritionDay } from "@/lib/validation/nutrition";
import { decodeDay,totals,proteinTenths,waterMl,dateInZone } from "@/lib/nutrition/records";
const id="11111111-1111-4111-8111-111111111111";
export const meal={id,kind:"meal" as const,logged_on:"2026-10-23",timezone:"Australia/Melbourne",description:"TEST ONLY meal",protein_tenths:101,water_ml:null,revision:0};
it("reconciles exact saved totals including zero and decimal protein without floating drift",()=>{
 const entries=[meal,{...meal,id:"22222222-2222-4222-8222-222222222222",protein_tenths:202}];
 expect(totals(entries)).toEqual({protein_tenths:303,water_ml:0});
 expect(decodeDay({day:meal.logged_on,timezone:meal.timezone,entries,totals:totals(entries)},meal.logged_on,meal.timezone).entries).toEqual(entries);
});
it.each(["2026-02-29","2026-04-31","2026-1-01","2101-01-01"])("rejects invalid calendar date %s",day=>expect(nutritionDay.safeParse(day).success).toBe(false));
it("assigns midnight and DST instants in the explicit zone rather than host timezone",()=>{
 expect(dateInZone(new Date("2026-10-22T13:00:00Z"),meal.timezone)).toBe("2026-10-23");
 expect(dateInZone(new Date("2026-10-22T12:59:59Z"),meal.timezone)).toBe("2026-10-22");
 expect(dateInZone(new Date("2026-10-03T16:00:00Z"),meal.timezone)).toBe("2026-10-04");
});
it.each(["","-1","1e2","Infinity","0.01","1.00","0x10"])("rejects silently rounded or coerced protein %s",raw=>expect(()=>proteinTenths(raw)).toThrow());
it.each(["0","-1","1.2","1e2","", "100001"])("rejects invalid water %s",raw=>expect(()=>waterMl(raw)).toThrow());
it("accepts supported exact entry limits without endorsing targets",()=>{expect(proteinTenths("0")).toBe(0);expect(proteinTenths("12.3")).toBe(123);expect(waterMl("250")).toBe(250);});
it.each([{user_id:id},{role:"admin"},{entry:{...meal,user_id:id}},{entry:{...meal,protein_tenths:1.5}},{entry:{...meal,water_ml:200}},{entry:{...meal,timezone:"madeup"}},{entry:{...meal,revision:1}}])("rejects forged identity and invalid contract %j",patch=>expect(nutritionMutation.safeParse({action:"create",mutation_id:id,entry:meal,...patch}).success).toBe(false));
it.each(["totals","duplicate","date","timezone"])("fails closed on %s response mismatch",kind=>{
 const raw={day:meal.logged_on,timezone:meal.timezone,entries:[meal],totals:totals([meal])};
 if(kind==="totals")raw.totals.protein_tenths++;
 if(kind==="duplicate")raw.entries.push(meal);
 if(kind==="date")raw.entries=[{...meal,logged_on:"2026-10-22"}];
 if(kind==="timezone")raw.timezone="UTC";
 expect(()=>decodeDay(raw,meal.logged_on,meal.timezone)).toThrow();
});
