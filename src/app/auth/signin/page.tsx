import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

async function signInWithCredentials(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      username: String(formData.get("username") ?? "").slice(0, 80),
      password: String(formData.get("password") ?? "").slice(0, 1024),
      redirectTo: "/it",
    });
  } catch (error) {
    if (error instanceof AuthError) redirect("/auth/signin?error=1");
    throw error;
  }
  redirect("/it");
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="grid min-h-screen place-items-center bg-[#f6f8f6] px-5 py-12">
    <div className="w-full max-w-md">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid size-11 place-items-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-border"><Image src="/lacc-logo.ico" alt="Latin American Community Center" width={40} height={40} className="size-10 object-contain" /></div>
        <div><p className="font-semibold tracking-tight text-foreground">LACC IT Support</p><p className="text-sm text-muted-foreground">IT staff portal</p></div>
      </div>
      <section className="rounded-2xl border bg-background p-8 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.35)] sm:p-10">
        <p className="text-sm font-medium text-primary">IT operations</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Staff sign in</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Use the shared IT staff account to open the support workspace.</p>
        {error && <p role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Sign-in failed. Check the username and password and try again.</p>}
        <form action={signInWithCredentials} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">Username</label>
            <input id="username" name="username" type="text" autoComplete="username" required maxLength={80} className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024} className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <button type="submit" className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Sign in<ArrowRight className="size-4" /></button>
        </form>
      </section>
      <p className="mt-5 text-center text-xs text-muted-foreground">Authorized LACC IT staff only</p>
    </div>
  </main>;
}
