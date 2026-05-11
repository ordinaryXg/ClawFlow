import { FC, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';

declare let __webpack_public_path__: string | undefined;

const MAX_PDF_CANVAS_PAGES = 32;

function pdfWorkerSrc(): string {
  const pub = typeof __webpack_public_path__ === 'string' && __webpack_public_path__ ? __webpack_public_path__ : '/';
  const base = pub.endsWith('/') ? pub : `${pub}/`;
  return `${base}pdf.worker.min.mjs`;
}

let workerConfigured = false;
function ensurePdfWorker(): void {
  if (workerConfigured) return;
  GlobalWorkerOptions.workerSrc = pdfWorkerSrc();
  workerConfigured = true;
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const FilePreviewPdfCanvas: FC<{ pdfBase64: string }> = ({ pdfBase64 }) => {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hostEl = hostRef.current;
    if (hostEl) hostEl.innerHTML = '';
    docRef.current = null;

    void (async () => {
      try {
        setLoading(true);
        setError(null);
        ensurePdfWorker();
        const raw = base64ToUint8Array(pdfBase64);
        const loadingTask = getDocument({ data: new Uint8Array(raw), useSystemFonts: true });
        const doc = await loadingTask.promise;
        if (cancelled) {
          await doc.destroy().catch(() => undefined);
          return;
        }
        docRef.current = doc;

        const host = hostRef.current;
        if (!host) {
          await doc.destroy().catch(() => undefined);
          return;
        }
        host.innerHTML = '';

        const total = doc.numPages;
        const toRender = Math.min(total, MAX_PDF_CANVAS_PAGES);
        const wrapW = Math.max(320, host.clientWidth || 640);

        for (let p = 1; p <= toRender; p++) {
          if (cancelled) break;
          const page = await doc.getPage(p);
          const baseVp = page.getViewport({ scale: 1 });
          const scale = Math.min(2.25, Math.max(0.75, (wrapW - 16) / baseVp.width));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.className = 'cf-filePreview__pdfPageCanvas';
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const task = page.render({ canvas, viewport });
          await task.promise;
          if (cancelled) break;
          const wrap = document.createElement('div');
          wrap.className = 'cf-filePreview__pdfPage';
          const label = document.createElement('div');
          label.className = 'cf-filePreview__pdfPageLabel cf-sub';
          label.textContent = t('chat.rightTabs.previewPdfCanvasPageLabel', { current: p, total });
          wrap.appendChild(label);
          wrap.appendChild(canvas);
          host.appendChild(wrap);
        }

        const skipped = total - toRender;
        if (!cancelled && skipped > 0) {
          const note = document.createElement('div');
          note.className = 'cf-sub cf-filePreview__pdfCanvasNote';
          note.textContent = t('chat.rightTabs.previewPdfCanvasMorePages', { n: skipped });
          host.appendChild(note);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      void docRef.current?.destroy().catch(() => undefined);
      docRef.current = null;
    };
  }, [pdfBase64, t]);

  return (
    <div className="cf-filePreview__pdfCanvasHost">
      {loading ? <div className="cf-sub">{t('chat.rightTabs.previewPdfRendering')}</div> : null}
      {error ? <div className="cf-errorText">{error}</div> : null}
      <div ref={hostRef} className="cf-filePreview__pdfCanvasPages" />
    </div>
  );
};
