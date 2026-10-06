import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/require-user";
import { notFound } from "next/navigation";

const adminItems = [
  ["Users", "1,248 active members"],
  ["Exercises", "50 starter exercises"],
  ["Plan templates", "8 workout types"],
  ["Subscriptions", "Free, Pro, Premium"],
  ["Safety flags", "3 awaiting review"],
  ["Content", "Meal and coaching copy"]
];

export default async function AdminPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (data?.role !== "admin") notFound();
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Admin dashboard</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {adminItems.map(([title, description]) => (
          <div key={title} className="rounded-[8px] bg-card p-5 shadow-soft">
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-2 text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
