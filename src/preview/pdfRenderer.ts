import type { PDFDocumentLoadingTask } from 'pdfjs-dist'
import { safeFileUrl } from './previewContent'

const workerUrl = new URL('../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href

export const PDF_CANVAS_MAX_PIXELS = 4_000_000
export const PDF_PAGE_LIMIT = 500

export async function openPdf(fileId: string, url: string): Promise<PDFDocumentLoadingTask> {
  const contentUrl = safeFileUrl(fileId, url)
  const pdf = await import('pdfjs-dist')
  pdf.GlobalWorkerOptions.workerSrc = workerUrl
  return pdf.getDocument({
    url: contentUrl,
    withCredentials: true,
    disableStream: true,
    disableAutoFetch: true,
    rangeChunkSize: 64 * 1024,
    enableXfa: false,
    maxImageSize: 16_000_000,
    canvasMaxAreaInBytes: 64 * 1024 * 1024,
    useSystemFonts: true,
    useWasm: false,
    useWorkerFetch: false,
    verbosity: 0,
  })
}
