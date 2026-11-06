import Link from "next/link";
import { ClipboardList, LayoutDashboard, LogOut, PackageOpen, Plus, Settings, ShieldCheck, Users } from "lucide-react";
import type { Employee } from "@/lib/domain/models";
import { BrandMark } from "./brand-mark";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { MobileNav } from "./mobile-nav";

export function AppShell({ employee, children }: { employee: Employee; children: React.ReactNode }) {
  const elevated = employee.role !== "EMPLOYEE";
  return (
    <div className="min-h-screen bg-muted/30">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:p-3">Skip to content</a>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link href={elevated ? "/it" : "/dashboard"}><BrandMark /></Link><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-medium">{employee.displayName}</p><p className="text-xs text-muted-foreground">{employee.role.replace("_", " ")}</p></div><Button asChild variant="ghost" size="icon" aria-label="Sign out"><Link href="/api/auth/signout"><LogOut className="size-4" /></Link></Button></div></div>
      </header>
      <div className="mx-auto grid max-w-7xl md:grid-cols-[248px_minmax(0,1fr)]">
        <aside className={`hidden min-h-[calc(100vh-4rem)] border-r p-4 md:block ${elevated ? "border-slate-800 bg-slate-950 text-slate-300" : "bg-background"}`}>
          <nav className="space-y-1" aria-label="Primary navigation">
            {!elevated && <NavLink href="/dashboard" icon={<LayoutDashboard />} label="Overview" />}
            {!elevated && <><NavLink href="/requests/new" icon={<Plus />} label="Badge & access request" /><NavLink href="/requests" icon={<ClipboardList />} label="My requests" /></>}
            {elevated && <><Separator className="my-4 bg-slate-800" /><NavLink href="/it" icon={<ShieldCheck />} label="Support inbox" dark /><NavLink href="/it?state=ALL&page=1" icon={<ClipboardList />} label="All tickets" dark /><NavLink href="/users" icon={<Users />} label="Users" dark /><Separator className="my-4 bg-slate-800" /><NavLink href="/inventory" icon={<PackageOpen />} label="Asset Tracker" dark /><NavLink href="/it/onboarding" icon={<Users />} label="New-hire setup / Nuevas contrataciones" dark /><NavLink href="/it/printers" icon={<Settings />} label="Printer directory / Impresoras" dark />{employee.role === "ADMIN" && <NavLink href="/admin" icon={<Settings />} label="Administration" dark />}</>}
          </nav>
        </aside>
        <main id="main" className="min-w-0 p-4 pb-24 sm:p-6 lg:p-8">{children}</main>
      </div>
      <MobileNav elevated={elevated} admin={employee.role === "ADMIN"} />
    </div>
  );
}

function NavLink({ href, icon, label, external = false, dark = false }: { href: string; icon: React.ReactElement<{ className?: string }>; label: string; external?: boolean; dark?: boolean }) { return <Button asChild variant="ghost" className={`h-auto min-h-10 min-w-0 w-full justify-start gap-3 whitespace-normal px-3 py-2 text-left leading-5 ${dark ? "text-slate-300 hover:bg-white/10 hover:text-white focus-visible:ring-white/50" : ""}`}><Link href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}><span className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-4">{icon}</span><span className="min-w-0 whitespace-normal break-words">{label}</span></Link></Button>; }
