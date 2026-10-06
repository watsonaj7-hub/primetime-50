"use client";
import { type MutationState } from "@/lib/types/mutation";
export function MutationStatus({ state }: { state: MutationState }) {
  return <div role={state.status === "error" ? "alert" : "status"} aria-live="polite" className={state.status === "error" ? "text-destructive" : "text-primary"}>
    {state.message && <p>{state.message}</p>}
    {state.fields && <ul className="mt-2 list-inside list-disc">{Object.entries(state.fields).flatMap(([field, errors]) => errors?.map((message, index) => <li key={`${field}-${index}`}>{field.replaceAll("_", " ")}: {message}</li>) ?? [])}</ul>}
  </div>;
}
