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
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link href="/dashboard"><BrandMark /></Link><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-medium">{employee.displayName}</p><p className="text-xs text-muted-foreground">{employee.role.replace("_", " ")}</p></div><Button asChild variant="ghost" size="icon" aria-label="Sign out"><Link href="/api/auth/signout"><LogOut className="size-4" /></Link></Button></div></div>
      </header>
      <div className="mx-auto grid max-w-7xl md:grid-cols-[220px_1fr]">
        <aside className="hidden min-h-[calc(100vh-4rem)] border-r bg-background p-4 md:block">
          <nav className="space-y-1" aria-label="Primary navigation">
            <NavLink href="/dashboard" icon={<LayoutDashboard />} label="Overview" />
            {!elevated && <><NavLink href="/requests/new" icon={<Plus />} label="Get IT help" /><NavLink href="/requests" icon={<ClipboardList />} label="My requests" /></>}
            {elevated && <><Separator className="my-4" /><NavLink href="/it" icon={<ShieldCheck />} label="Support inbox" /><NavLink href="/it?state=ALL&page=1" icon={<ClipboardList />} label="All tickets" /><NavLink href="/users" icon={<Users />} label="Users" /><Separator className="my-4" /><NavLink href="https://lacc-asset-tracker.vercel.app" icon={<PackageOpen />} label="LACC inventory" external />{employee.role === "ADMIN" && <NavLink href="/admin" icon={<Settings />} label="Administration" />}</>}
          </nav>
        </aside>
        <main id="main" className="min-w-0 p-4 pb-24 sm:p-6 lg:p-8">{children}</main>
      </div>
      <MobileNav elevated={elevated} admin={employee.role === "ADMIN"} />
    </div>
  );
}

function NavLink({ href, icon, label, external = false }: { href: string; icon: React.ReactElement<{ className?: string }>; label: string; external?: boolean }) { return <Button asChild variant="ghost" className="w-full justify-start"><Link href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>{<span className="[&_svg]:size-4">{icon}</span>}{label}</Link></Button>; }
