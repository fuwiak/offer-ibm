import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.js?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const DEFAULT_SCALE = 1.25;

/**
 * Renders a PDF from a blob URL using PDF.js (canvas per page).
 */
export default function PdfJsViewer({ url, title = "PDF preview" }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    const canvases = [];

    async function render() {
      setLoading(true);
      setError(null);
      setNumPages(0);

      const container = containerRef.current;
      if (!container) return;
      container.replaceChildren();

      try {
        const task = pdfjs.getDocument({ url, withCredentials: false });
        const pdf = await task.promise;
        if (cancelled) return;

        setNumPages(pdf.numPages);

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: DEFAULT_SCALE });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "offerKp-pdfjs-viewer__page";
          canvas.setAttribute("aria-label", `${title} — page ${pageNum}`);
          canvases.push(canvas);
          container.appendChild(canvas);
          await page.render({ canvasContext: context, viewport }).promise;
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    render();

    return () => {
      cancelled = true;
      containerRef.current?.replaceChildren();
    };
  }, [url, title]);

  if (!url) return null;

  return (
    <div className="offerKp-pdfjs-viewer flex flex-col flex-1 min-h-0">
      {loading && (
        <p className="p-4 text-xs text-theme-text-secondary shrink-0">…</p>
      )}
      {error && (
        <p className="p-4 text-xs text-red-500 shrink-0">{error}</p>
      )}
      {!loading && !error && numPages > 0 && (
        <p className="px-3 py-1 text-[10px] text-theme-text-secondary/80 shrink-0 border-b border-theme-sidebar-border">
          {numPages} {numPages === 1 ? "page" : "pages"}
        </p>
      )}
      <div
        ref={containerRef}
        className="offerKp-pdfjs-viewer__pages flex-1 overflow-auto min-h-0 bg-[#e8e8e8] p-2 flex flex-col items-center gap-3"
      />
    </div>
  );
}
