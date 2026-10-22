import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NutritionPanel } from "@/components/nutrition-panel";
it("offers a labelled target-free meal and water logger without invented prescriptions", () => {
 const html=renderToStaticMarkup(createElement(NutritionPanel));
 expect(html).not.toContain("1,920"); expect(html).not.toContain("135g");
 expect(html).toContain("Nutrition log");expect(html).toContain("Protein (g)");expect(html).toContain("Water (mL)");expect(html).toContain("Timezone");
});
import { NutritionView } from "@/components/nutrition-panel";
import { NutritionController } from "@/lib/client/nutrition";
import { totals } from "@/lib/nutrition/records";
const entry={id:"11111111-1111-4111-8111-111111111111",kind:"meal" as const,logged_on:"2026-10-23",timezone:"Australia/Melbourne",description:"TEST ONLY meal",protein_tenths:0,water_ml:null,revision:1};
it.each(["loading","ready","error","signedOut"] as const)("shows honest accessible %s state without sample progress",status=>{
 const c=new NutritionController(fetch,async()=>true);const html=renderToStaticMarkup(createElement(NutritionView,{controller:c,state:{...c.state,status,busy:status==="loading",day:entry.logged_on,timezone:entry.timezone,error:status==="error"?"Connection unavailable":"",saved:status==="ready"?{day:entry.logged_on,timezone:entry.timezone,entries:[],totals:totals([])}:null}}));
 expect(html).not.toContain("progressbar");expect(html).not.toContain("Remaining");expect(html).not.toContain("135g");
 if(status==="loading"){expect(html).toContain('aria-busy="true"');expect(html).not.toContain("Saved daily totals");}
 if(status==="ready"){expect(html).toContain("No entries saved");expect(html).toContain("Saved daily totals");}
 if(status==="error"){expect(html).toContain('role="alert"');expect(html).not.toContain("No entries saved");}
 if(status==="signedOut"){expect(html).toContain("Sign in to view nutrition");expect(html).not.toContain("Saved nutrition entries");}
});
it("renders saved zero, units, raw retained input, labels and explicit date/zone editing",()=>{
 const c=new NutritionController(fetch,async()=>true);const state={...c.state,status:"ready" as const,day:entry.logged_on,timezone:entry.timezone,saved:{day:entry.logged_on,timezone:entry.timezone,entries:[entry],totals:totals([entry])},draft:{id:entry.id,kind:entry.kind,description:entry.description,amount:"bad raw input",logged_on:entry.logged_on,timezone:entry.timezone,revision:1,existing:true},error:"Please check this input",delayed:true};
 const html=renderToStaticMarkup(createElement(NutritionView,{controller:c,state}));
 for(const expected of ["0 g protein","TEST ONLY meal","bad raw input",'for="entry-description"','for="entry-day"','for="entry-zone"',"Still waiting","Discard unsaved changes",entry.timezone,"Saved revision 1"])expect(html).toContain(expected);
});
