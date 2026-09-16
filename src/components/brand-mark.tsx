import Image from "next/image";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-border"><Image src="/lacc-logo.ico" alt="Latin American Community Center" width={36} height={36} className="size-9 object-contain" /></div>
      {!compact && <div><p className="font-semibold leading-none tracking-tight">LACC IT Support</p><p className="mt-1 text-xs text-muted-foreground">Staff portal</p></div>}
    </div>
  );
}
