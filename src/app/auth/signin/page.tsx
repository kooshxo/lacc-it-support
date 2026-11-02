import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { signIn } from "@/auth";

async function signInWithGoogle() {
  "use server";
  await signIn("google", { redirectTo: "/it" });
}

async function signInWithMicrosoft() {
  "use server";
  await signIn("microsoft-entra-id", { redirectTo: "/requests/new" });
}

export default function SignInPage() {
  return <main className="grid min-h-screen place-items-center bg-[#f6f8f6] px-5 py-12">
    <div className="w-full max-w-md">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid size-11 place-items-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-border"><Image src="/lacc-logo.ico" alt="Latin American Community Center" width={40} height={40} className="size-10 object-contain" /></div>
        <div><p className="font-semibold tracking-tight text-foreground">LACC IT Support</p><p className="text-sm text-muted-foreground">Staff portal</p></div>
      </div>
      <section className="rounded-2xl border bg-background p-8 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.35)] sm:p-10">
        <p className="text-sm font-medium text-primary">IT operations</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Use your LACC Microsoft 365 account to request a badge or access.</p>
        {process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID && <form action={signInWithMicrosoft}><button type="submit" className="mt-6 w-full rounded-lg bg-primary p-3 font-semibold text-primary-foreground">Sign in with Microsoft 365</button></form>}
        <form action={signInWithGoogle}><button type="submit" className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">IT staff Google sign-in<ArrowRight className="size-4" /></button></form>
      </section>
      <p className="mt-5 text-center text-xs text-muted-foreground">Authorized staff only</p>
    </div>
  </main>;
}
