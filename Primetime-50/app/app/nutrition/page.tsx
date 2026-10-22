import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { NutritionPanel } from "@/components/nutrition-panel";
import { requireUser } from "@/lib/auth/require-user";
// This owned route also gates on the server; the existing /nutrition route has middleware.
export default async function OwnedNutritionPage(){
 const identity=await requireUser().catch(()=>null);
 if(!identity)redirect("/login?next=/app/nutrition");
 return <AppShell><NutritionPanel userId={identity.user.id}/></AppShell>;
}
