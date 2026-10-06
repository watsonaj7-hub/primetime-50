import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { AuthForm } from "@/components/auth/auth-form";
import { supabaseConfig } from "@/lib/config/public";
export default function RegisterPage() {
  return <AppShell><div className="mx-auto max-w-xl"><Card>
    <CardHeader><h1 className="text-3xl font-bold">Create your account</h1><p className="text-muted-foreground">Save your profile and start your fitness journey.</p></CardHeader>
    <CardContent className="space-y-4"><AuthForm mode="register" configured={!!supabaseConfig()} /><p>Already registered? <Link href="/login" className="font-semibold text-primary">Sign in</Link></p></CardContent>
  </Card></div></AppShell>;
}
