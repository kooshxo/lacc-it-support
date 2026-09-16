"use client";
import Link from "next/link";
import { ClipboardList, LayoutDashboard, Menu, PackageOpen, Plus, Settings, ShieldCheck, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

export function MobileNav({ elevated, admin }: { elevated: boolean; admin: boolean }) {
  const [open, setOpen] = useState(false);
  const links: Array<{ label: string; href: string; Icon: LucideIcon }> = elevated ? [
    { label: "Overview", href: "/dashboard", Icon: LayoutDashboard }, { label: "Support inbox", href: "/it", Icon: ShieldCheck }, { label: "All tickets", href: "/it?state=ALL&page=1", Icon: ClipboardList }, { label: "Users", href: "/users", Icon: Users }, { label: "LACC inventory", href: "https://lacc-asset-tracker.vercel.app", Icon: PackageOpen }, ...(admin ? [{ label: "Administration", href: "/admin", Icon: Settings }] : []),
  ] : [{ label: "Home", href: "/dashboard", Icon: LayoutDashboard }, { label: "Get IT help", href: "/requests/new", Icon: Plus }, { label: "My requests", href: "/requests", Icon: ClipboardList }];
  return <div className="md:hidden"><button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Close navigation" : "Open navigation"} className="fixed bottom-4 right-4 z-50 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">{open ? <X /> : <Menu />}</button>{open && <><button type="button" aria-label="Close navigation overlay" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/30" /><nav className="fixed inset-x-4 bottom-20 z-50 rounded-2xl border bg-background p-2 shadow-xl" aria-label="Mobile navigation">{links.map(({ label, href, Icon }) => <Link key={label} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} onClick={() => setOpen(false)} className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium hover:bg-muted"><Icon className="size-5 text-primary" />{label}</Link>)}</nav></>}</div>;
}
