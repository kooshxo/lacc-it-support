import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function AccessDenied() { return <main className="grid min-h-screen place-items-center bg-muted/40 p-6"><div className="max-w-md rounded-2xl border bg-background p-8 text-center shadow-sm"><ShieldX className="mx-auto size-10 text-destructive"/><h1 className="mt-5 text-2xl font-semibold">Access unavailable</h1><p className="mt-3 text-muted-foreground">Your signed-in account is not authorized for this area. If your role recently changed, contact LACC IT.</p><Button asChild className="mt-6"><Link href="/dashboard">Return to support</Link></Button></div></main>; }
