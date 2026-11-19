"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

type AgreementPdfViewerProps = {
  url: string;
  title: string;
};

export function AgreementPdfViewer({ url, title }: AgreementPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [documentState, setDocumentState] = useState<{ url: string; document: PDFDocumentProxy | null; error: string }>({ url: "", document: null, error: "" });
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [renderState, setRenderState] = useState<{ key: string; error: string }>({ key: "", error: "" });
  const document = documentState.url === url ? documentState.document : null;
  const loadingError = documentState.url === url ? documentState.error : "";
  const renderKey = `${url}:${width}:${zoom}`;
  const renderError = renderState.key === renderKey ? renderState.error : "";
  const rendered = renderState.key === renderKey && !renderState.error;

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        task = pdfjs.getDocument({ url, isEvalSupported: false });
        const loaded = await task.promise;
        if (cancelled) {
          await loaded.destroy();
          return;
        }
        setDocumentState({ url, document: loaded, error: "" });
      } catch {
        if (!cancelled) setDocumentState({ url, document: null, error: "The PDF preview could not be rendered in this browser. Use Open PDF or Download PDF to review the approved document." });
      }
    })();

    return () => {
      cancelled = true;
      if (task) void task.destroy();
    };
  }, [url]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!document || !canvas || !width) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;

    void (async () => {
      try {
        const page = await document.getPage(1);
        const natural = page.getViewport({ scale: 1 });
        const fit = Math.min(1, Math.max(0.1, (width - 24) / natural.width));
        const viewport = page.getViewport({ scale: fit * zoom });
        const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas rendering is unavailable.");

        canvas.width = Math.ceil(viewport.width * pixelRatio);
        canvas.height = Math.ceil(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          background: "rgb(255,255,255)",
        });
        await renderTask.promise;
        if (!cancelled) setRenderState({ key: renderKey, error: "" });
      } catch {
        if (!cancelled) setRenderState({ key: renderKey, error: "The PDF page could not be drawn. Use Open PDF or Download PDF to review the approved document." });
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, renderKey, width, zoom]);

  return (
    <section aria-label={title} className="min-w-0">
      <div className="no-print flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
        <p className="text-sm font-medium" aria-live="polite">{rendered ? "Page 1 of 1" : loadingError || renderError ? "PDF preview unavailable" : "Rendering approved agreement…"}</p>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="inline-flex size-10 items-center justify-center rounded-md border bg-background disabled:opacity-50" onClick={() => setZoom((value) => Math.max(0.7, Math.round((value - 0.15) * 100) / 100))} disabled={zoom <= 0.7} aria-label="Zoom out"><Minus className="size-4"/></button>
          <span className="min-w-12 text-center text-xs tabular-nums" aria-label={`Zoom ${Math.round(zoom * 100)} percent`}>{Math.round(zoom * 100)}%</span>
          <button type="button" className="inline-flex size-10 items-center justify-center rounded-md border bg-background disabled:opacity-50" onClick={() => setZoom((value) => Math.min(2.5, Math.round((value + 0.15) * 100) / 100))} disabled={zoom >= 2.5} aria-label="Zoom in"><Plus className="size-4"/></button>
          <button type="button" className="inline-flex size-10 items-center justify-center rounded-md border bg-background" onClick={() => setZoom(1)} aria-label="Reset zoom"><RotateCcw className="size-4"/></button>
        </div>
      </div>
      {(loadingError || renderError) && <p role="alert" className="border-b bg-amber-50 p-3 text-sm text-amber-950">{loadingError || renderError}</p>}
      {!rendered && !loadingError && !renderError && <div className="grid min-h-80 place-items-center p-6 text-sm text-muted-foreground" role="status">Rendering the approved LACC PDF…</div>}
      <div ref={containerRef} className="max-h-[72svh] overflow-auto overscroll-contain bg-slate-200 p-3 sm:max-h-[78svh] sm:p-5" tabIndex={0} aria-label="Scrollable agreement PDF">
        <canvas ref={canvasRef} className="mx-auto block shadow-md" role="img" aria-label="Page 1 of 1 of the LACC laptop agreement" />
      </div>
    </section>
  );
}
