"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function PortalError({retry}:{error:Error&{digest?:string};retry:()=>void}){return <div className="grid min-h-[60vh] place-items-center"><div className="max-w-md text-center"><AlertTriangle className="mx-auto size-10 text-amber-600"/><h1 className="mt-5 text-2xl font-semibold">Support data is temporarily unavailable</h1><p className="mt-3 text-muted-foreground">Your last action may not have been saved. Please retry before entering it again.</p><Button className="mt-6" onClick={retry}>Try again</Button></div></div>}
