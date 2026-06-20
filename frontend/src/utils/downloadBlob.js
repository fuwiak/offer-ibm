/**
 * Trigger a file download without racing React portals on document.body.
 * file-saver appends/removes anchors as direct body children, which can break
 * insertBefore reconciliation for createPortal tooltips during the same tick.
 */
export function downloadBlob(blob, filename = "download") {
  return new Promise((resolve, reject) => {
    if (!blob) {
      reject(new Error("No blob"));
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = filename;
          anchor.rel = "noopener";
          anchor.style.display = "none";

          let container = document.getElementById("blob-download-root");
          if (!container) {
            container = document.createElement("div");
            container.id = "blob-download-root";
            container.setAttribute("aria-hidden", "true");
            container.style.display = "none";
            document.body.appendChild(container);
          }

          container.appendChild(anchor);
          anchor.click();

          window.setTimeout(() => {
            if (anchor.parentNode === container) {
              container.removeChild(anchor);
            }
            URL.revokeObjectURL(url);
            resolve();
          }, 0);
        } catch (err) {
          reject(err);
        }
      });
    });
  });
}
