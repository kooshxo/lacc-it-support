"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh visible server-rendered ticket data without disturbing an active edit. */
export function LiveTicketRefresh({ intervalMs = 7000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (document.querySelector("form[data-unsaved='true']")) return;
      router.refresh();
    };
    const timer = window.setInterval(refresh, intervalMs);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [intervalMs, router]);
  return null;
}
