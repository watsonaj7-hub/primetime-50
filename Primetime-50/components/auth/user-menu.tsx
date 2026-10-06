"use client";
import { useActionState } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { initialState } from "@/lib/types/mutation";
import { MutationStatus } from "@/components/shared/mutation-status";
export function UserMenu() {
  const [state, action, pending] = useActionState(logout, initialState);
  return <form action={action} aria-busy={pending}><Button type="submit" variant="outline" disabled={pending}>{pending ? "Signing out…" : "Sign out"}</Button><MutationStatus state={state} /></form>;
}
