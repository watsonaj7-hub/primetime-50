import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => children }));
import ProgressPage from "@/app/progress/page";
import Home from "@/app/page";
it("production progress and home render owned history and no invented personal metrics", () => {
 for (const Page of [ProgressPage, Home]) {
  const html = renderToStaticMarkup(createElement(Page));
  expect(html).toContain("Workout history");
  for (const invented of ["-4.1 lb","-1.7 in","7,840","7h 12m","86%","+12%","83%","91%","Recovery score","Done today","7h 20m"]) expect(html).not.toContain(invented);
 }
});
import { HistoryView } from "@/components/history/history-experience";
import { HistoryController } from "@/lib/client/history";
import { historyRecord, personalRecord } from "./history-fixture";
it("renders original personal and reviewed saved details, provenance, zero values and stable navigation",()=>{
 const r=historyRecord(),p=personalRecord(2);r.exercise_set_logs[0].weight=0;
 const html=renderToStaticMarkup(createElement(HistoryView,{state:{status:"ready",records:[r,p],selected:r,error:""},retry:()=>{}}));
 for(const expected of ["13.5","RPE","Exercise key",r.id,p.id,"TEST DATA ONLY",`/workout?id=${r.id}`,`/progress?id=${p.id}`,"does not confirm current eligibility or approval","Personal records reopen here","Load (kg)","Insufficient comparable data"]) {
  expect(html).toContain(expected);
 }
 expect(html).toContain("<dd>0</dd>");expect(html.match(new RegExp(`Saved sets and provenance · ${r.id}`,"g"))).toHaveLength(1);
 expect(html).not.toContain(`/workout?id=${p.id}`);
});
it.each(["loading","error","signedOut","ready"] as const)("renders distinct accessible %s state without stale history",status=>{
 const c=new HistoryController(fetch,async()=>true);const html=renderToStaticMarkup(createElement(HistoryView,{state:{...c.state,status,error:status==="error"?"Network unavailable":""},retry:()=>{}}));
 expect(html).not.toContain("TEST ONLY movement");
 if(status==="error"){expect(html).toContain('role="alert"');expect(html).not.toContain("No completed workouts");}
 if(status==="loading"){expect(html).toContain('aria-busy="true"');expect(html).not.toContain("Insufficient comparable data");}
 if(status==="ready"){expect(html).toContain("No completed workouts");expect(html).toContain("Insufficient comparable data");}
 if(status==="signedOut")expect(html).toContain("History has been cleared");
});
