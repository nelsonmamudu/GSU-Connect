import workerPath from 'tesseract.js/dist/worker.min.js?url';
import corePath from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import model from '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { extractProofFields } from './proof';

export async function readProof(file: File, departments: string[], signal: AbortSignal) {
  let input: File | HTMLCanvasElement = file;
  if (file.type === 'application/pdf') {
    const pdf = await import('pdfjs-dist');
    pdf.GlobalWorkerOptions.workerSrc = pdfWorker;
    const task = pdf.getDocument({ data: await file.arrayBuffer() });
    try {
      const page = await (await task.promise).getPage(1);
      const content = await page.getTextContent();
      const text = content.items
        .map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : ''))
        .join('');
      const fields = extractProofFields(text, departments);
      if (Object.values(fields).some(Boolean)) return fields;
      signal.throwIfAborted();
      const size = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(2, 1600 / Math.max(size.width, size.height)),
      });
      input = document.createElement('canvas');
      input.width = viewport.width;
      input.height = viewport.height;
      await page.render({ canvas: input, viewport }).promise;
    } finally {
      await task.destroy();
    }
  }
  signal.throwIfAborted();
  const { createWorker } = await import('tesseract.js');
  const langPath = new URL('.', new URL(model, location.href)).href;
  const worker = await createWorker('eng', 1, {
    workerPath,
    corePath,
    langPath,
    errorHandler: () => {
      /* Errors are also reported by the worker promise. */
    },
  });
  const stop = () => {
    void worker.terminate();
  };
  signal.addEventListener('abort', stop, { once: true });
  try {
    signal.throwIfAborted();
    return extractProofFields((await worker.recognize(input)).data.text, departments);
  } finally {
    signal.removeEventListener('abort', stop);
    await worker.terminate();
  }
}
