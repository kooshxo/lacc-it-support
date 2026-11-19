"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AgreementSignForm } from "@/components/agreement-sign-form";
import { AgreementDocument } from "@/components/agreement-document";
import { AgreementPdfViewer } from "@/components/agreement-pdf-viewer";
import { isValidAgreementToken } from "@/lib/sql/agreement-state";
import { clearAgreementSessionToken, AGREEMENT_SESSION_HISTORY_KEY, readAgreementSessionToken, storeAgreementSessionToken, tokenFromAgreementHash } from "@/lib/agreements/agreement-link-session";
import { LAPTOP_TEMPLATE_URL, renderLaptopAgreementPdf } from "@/lib/agreements/laptop-pdf";

type Agreement = { data: Record<string, unknown>; status: string; signedAt: string | null; expiresAt: string; termsVersion: string };
type PdfResult = { key: string; url: string; data: Uint8Array | null; error: string };

const unavailable = "This agreement link is unavailable, expired, revoked, or already completed. Contact LACC IT for help.";

export function PublicAgreement() {
  const token = useSyncExternalStore(subscribeToAgreementNavigation, readTokenSnapshot, () => "\u0000");

  useEffect(() => {
    const fragmentToken = tokenFromAgreementHash(window.location.hash);
    if (!isValidAgreementToken(fragmentToken)) return;

    const state = window.history.state && typeof window.history.state === "object" ? window.history.state as Record<string, unknown> : {};
    const currentKey = state[AGREEMENT_SESSION_HISTORY_KEY];
    const sessionKey = typeof currentKey === "string" && /^[a-f0-9-]{36}$/i.test(currentKey) ? currentKey : window.crypto.randomUUID();
    if (!storeAgreementSessionToken(fragmentToken, sessionKey, window.sessionStorage)) return;

    try {
      const nextState = { ...state, [AGREEMENT_SESSION_HISTORY_KEY]: sessionKey };
      window.history.replaceState(nextState, "", `${window.location.pathname}${window.location.search}`);
    } catch {
      // Keep the fragment if the browser refuses history-state replacement. It remains client-only.
    }
  }, [token]);

  if (token === "\u0000") return <AgreementLoading/>;
  if (!isValidAgreementToken(token)) return <UnavailableAgreement message={unavailable}/>;
  return <AgreementLoader token={token}/>;
}

function readTokenSnapshot() {
  try {
    return readAgreementSessionToken(window.location.hash, window.history.state, window.sessionStorage);
  } catch {
    return tokenFromAgreementHash(window.location.hash);
  }
}

function subscribeToAgreementNavigation(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener("pageshow", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("pageshow", onChange);
  };
}

function clearCurrentSessionToken() {
  const state = window.history.state && typeof window.history.state === "object" ? { ...window.history.state } as Record<string, unknown> : {};
  const key = typeof state[AGREEMENT_SESSION_HISTORY_KEY] === "string" ? state[AGREEMENT_SESSION_HISTORY_KEY] as string : undefined;
  try {
    clearAgreementSessionToken(key, window.sessionStorage);
  } catch {
    // The link remains server-validated if browser session storage is disabled.
  }
  delete state[AGREEMENT_SESSION_HISTORY_KEY];
  try {
    window.history.replaceState(state, "", `${window.location.pathname}${window.location.search}`);
  } catch {
    // API authorization remains authoritative even if browser history cannot be updated.
  }
}

function AgreementLoader({ token }: { token: string }) {
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/agreement/access", {
          method: "POST",
          body: JSON.stringify({ token }),
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.agreement) {
          if (response.status === 404) clearCurrentSessionToken();
          setError(typeof payload.error === "string" ? payload.error : unavailable);
          return;
        }
        setAgreement(payload.agreement as Agreement);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setError("The agreement could not be loaded. Check your connection and reopen the private link.");
      }
    })();
    return () => controller.abort();
  }, [token]);

  if (error) return <UnavailableAgreement message={error}/>;
  if (!agreement) return <AgreementLoading/>;
  const onSigned = (name: string, signedAt: string) => setAgreement((current) => current ? { ...current, status: "COMPLETED", signedAt, data: { ...current.data, signer_name: name } } : current);
  return <AgreementReview token={token} agreement={agreement} onSigned={onSigned}/>;
}

function AgreementReview({ token, agreement, onSigned }: { token: string; agreement: Agreement; onSigned: (name: string, signedAt: string) => void }) {
  const [signerName, setSignerName] = useState(typeof agreement.data.signer_name === "string" ? agreement.data.signer_name : "");
  const [pdfResult, setPdfResult] = useState<PdfResult>({ key: "", url: "", data: null, error: "" });
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0);
  const previewKey = JSON.stringify([agreement.status, agreement.signedAt, agreement.termsVersion, agreement.data, signerName.trim(), retry]);
  const previewIsCurrent = pdfResult.key === previewKey;
  const pdfUrl = previewIsCurrent ? pdfResult.url : "";
  const pdfData = previewIsCurrent ? pdfResult.data : null;
  const pdfError = previewIsCurrent ? pdfResult.error : "";
  const pending = agreement.status === "PENDING";

  useEffect(() => {
    if (agreement.status !== "PENDING" && agreement.status !== "COMPLETED") return;
    let disposed = false;
    const id = ++sequence.current;
    let objectUrl = "";
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          let data: Uint8Array;
          if (agreement.status === "COMPLETED") {
            const response = await fetch("/api/agreement/document", {
              method: "POST",
              body: JSON.stringify({ token }),
              headers: { "Content-Type": "application/json", Accept: "application/pdf" },
              cache: "no-store",
              credentials: "same-origin",
            });
            if (!response.ok) throw new Error("The signed PDF could not be loaded. Contact LACC IT.");
            data = new Uint8Array(await response.arrayBuffer());
          } else {
            const response = await fetch(LAPTOP_TEMPLATE_URL, { cache: "force-cache", credentials: "same-origin" });
            if (!response.ok) throw new Error("The approved agreement template could not be loaded.");
            const background = new Uint8Array(await response.arrayBuffer());
            data = await renderLaptopAgreementPdf(background, agreement.data, { signerName: signerName.trim() || undefined });
          }
          if (disposed || id !== sequence.current) return;
          const blob = new Blob([new Uint8Array(data).buffer as ArrayBuffer], { type: "application/pdf" });
          objectUrl = URL.createObjectURL(blob);
          setPdfResult({ key: previewKey, url: objectUrl, data, error: "" });
        } catch (error) {
          if (disposed || id !== sequence.current) return;
          setPdfResult({ key: previewKey, url: "", data: null, error: error instanceof Error ? error.message : "The agreement preview could not be prepared." });
        }
      })();
    }, agreement.status === "COMPLETED" ? 0 : 250);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [agreement, previewKey, signerName, token]);

  if (!pending && agreement.status !== "COMPLETED") return <main className="min-h-screen bg-muted/30 p-4 sm:p-6"><section className="mx-auto max-w-4xl rounded-xl border bg-white p-4"><p className="mb-4 rounded-md border p-3 text-sm">This is a historical paper agreement. The original record is preserved.</p><AgreementDocument data={agreement.data} signedAt={agreement.signedAt} termsVersion={agreement.termsVersion} printable/></section></main>;

  const signedAt = agreement.signedAt ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(agreement.signedAt)) : "recorded";
  const expiresAt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(agreement.expiresAt));
  const fileName = `${String(agreement.data.asset_code || "LACC")}${pending ? "-agreement-preview" : "-signed-agreement"}.pdf`;

  return (
    <main className="min-h-screen bg-muted/30 p-3 sm:p-6">
      <header className="no-print mx-auto mb-4 flex max-w-6xl flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-semibold text-primary">Latin American Community Center</p><h1 className="mt-1 text-2xl font-bold">Laptop agreement</h1><p className="mt-1 text-sm text-muted-foreground">{pending ? "Review the completed agreement before signing." : "Electronically signed agreement"} Link expires {expiresAt}.</p></div>
        <span className={`inline-flex min-h-8 items-center rounded-full border px-3 text-sm font-semibold ${pending ? "border-amber-700 bg-amber-50 text-amber-950" : "border-emerald-700 bg-emerald-50 text-emerald-950"}`}>{pending ? "Pending signature" : "Electronically signed"}</span>
      </header>
      <section className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2"><p className="text-sm font-medium">Agreement preview · {agreement.termsVersion}</p>{pdfUrl && <div className="flex flex-wrap gap-2"><a className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={pdfUrl} target="_blank" rel="noreferrer">Open PDF in new tab</a><a className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={pdfUrl} download={fileName}>Download PDF</a></div>}</div>
          {pdfError ? <div className="p-5 text-sm text-destructive" role="alert">{pdfError}</div> : pdfUrl && pdfData ? <AgreementPdfViewer key={pdfUrl} data={pdfData} title="LACC laptop agreement PDF preview"/> : <div className="grid h-[60svh] min-h-80 place-items-center p-5 text-sm text-muted-foreground" role="status">Preparing the agreement PDF preview…</div>}
        </div>
        <aside className="no-print self-start rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold">{pending ? "Review and sign" : "Signing complete"}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">The agreement is populated from the assigned employee and laptop record. Missing equipment details remain blank.</p>
          {pending ? <AgreementSignForm token={token} signerName={signerName} onSignerNameChange={setSignerName} onSigned={onSigned} disabled={!pdfUrl}/> : <div className="mt-4 space-y-3"><p className="rounded-md border border-emerald-700 bg-emerald-50 p-3 text-sm font-medium text-emerald-950" role="status">{pdfUrl ? "The signed PDF has been finalized and stored." : pdfError ? "The signature is recorded, but the PDF could not be loaded." : "Loading the finalized signed PDF…"} Signing time: {signedAt}.</p>{pdfError && <button type="button" className="min-h-11 w-full rounded-md border px-4 font-semibold" onClick={() => setRetry((value) => value + 1)}>Retry signed PDF</button>}<p className="text-sm text-muted-foreground">This is a typed electronic signature, not a certificate-backed cryptographic signature.</p>{pdfUrl && <a className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 font-semibold text-primary-foreground" href={pdfUrl} download={fileName}>Download signed PDF</a>}</div>}
        </aside>
      </section>
    </main>
  );
}

function AgreementLoading() { return <main className="grid min-h-screen place-items-center p-5"><p className="rounded-lg border bg-card p-5" role="status">Loading your agreement…</p></main>; }
function UnavailableAgreement({ message }: { message: string }) { return <main className="mx-auto max-w-xl p-5 sm:p-8"><section className="rounded-lg border bg-card p-6"><p className="text-sm font-semibold text-muted-foreground">The Latin American Community Center</p><h1 className="mt-2 text-2xl font-bold">Agreement link unavailable</h1><p className="mt-3 leading-7">{message}</p></section></main>; }
