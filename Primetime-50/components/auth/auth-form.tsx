"use client";
import { useActionState, useState } from "react";
import { login, register } from "@/app/actions/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MutationStatus } from "@/components/shared/mutation-status";
import { initialState } from "@/lib/types/mutation";
export function AuthForm({ mode, next = "/onboarding", configured }: { mode: "login" | "register"; next?: string; configured: boolean }) {
  const [state, action, pending] = useActionState(mode === "login" ? login : register, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  return <form action={action} className="space-y-4" aria-busy={pending}>
    {!configured && <p role="alert" className="text-destructive">Account services are not configured. Please contact the site owner.</p>}
    <input type="hidden" name="next" value={next} />
    <label className="block space-y-2"><span>Email address</span><Input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label className="block space-y-2"><span>Password</span><Input name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 12 : 1} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
    {mode === "register" && <label className="block space-y-2"><span>Confirm password</span><Input name="confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>}
    <Button type="submit" name="intent" value="password" className="w-full" disabled={pending || !configured}>{pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</Button>
    {mode === "login" && <Button type="submit" name="intent" value="magic_link" formNoValidate variant="outline" className="w-full" disabled={pending || !configured}>Send magic link</Button>}
    <MutationStatus state={state} />
  </form>;
}
