import { ApiError, baseUrl, SESSION_EXPIRED_EVENT } from '../api/client'
import type { FileItem } from '../types/files'

export const TEXT_PREVIEW_LIMIT = 64 * 1024
export const IMAGE_PREVIEW_LIMIT = 20 * 1024 * 1024
export const PDF_PREVIEW_LIMIT = 100 * 1024 * 1024
export type PreviewMode = 'image' | 'text' | 'pdf' | 'audio' | 'video' | 'unsupported'
export interface PreviewContent {
  mode: PreviewMode
  url: string
  mime: string
  text?: string
  truncated?: boolean
  sourceText?: boolean
  image?: Blob
  message?: string
}

/** 调用方可传入分享/管理接口，但绝不接收外部地址或任意同源网页。 */
export function safeFileUrl(fileId: string, provided?: string, kind: 'content' | 'thumbnail' = 'content'): string {
  if (!/^[A-Za-z0-9]{1,10}$/.test(fileId)) throw new ApiError('文件标识无效，无法预览', 600)
  const origin = window.location.origin
  const api = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`, origin)
  const candidate = new URL(provided || `${api.pathname}file/${kind}/${fileId}`, origin)
  if (api.origin !== origin || candidate.origin !== origin || candidate.username || candidate.password || candidate.search || candidate.hash) throw new ApiError('预览地址不属于本站文件接口', 600)
  const prefix = api.pathname.replace(/\/$/, '')
  const rest = candidate.pathname.startsWith(`${prefix}/`) ? candidate.pathname.slice(prefix.length + 1) : ''
  const own = `file/${kind}/${fileId}`
  const shared = new RegExp(`^showShare/${kind}/[A-Za-z0-9]{1,20}/${fileId}$`)
  const admin = new RegExp(`^admin/${kind}/[A-Za-z0-9]{1,15}/${fileId}$`)
  if (rest !== own && !shared.test(rest) && !admin.test(rest)) throw new ApiError('预览地址与当前文件不匹配', 600)
  return candidate.pathname
}

function accessError(code: number, message?: string): ApiError {
  if (code === 901 || code === 401) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    return new ApiError('登录已过期，请重新登录后查看文件', code)
  }
  const messages: Record<number, string> = { 403: '没有权限查看此文件', 404: '文件不存在或已不可用', 902: '分享已失效，无法查看此文件', 903: '分享验证已失效，请重新提取分享' }
  return new ApiError(messages[code] || message || '暂时无法读取文件，请稍后重试', code)
}

export async function readCapped(response: Response, limit: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (length < limit) {
      if (signal.aborted) throw new DOMException('读取已取消', 'AbortError')
      const result = await reader.read()
      if (result.done) break
      const slice = result.value.subarray(0, Math.min(limit - length, result.value.byteLength))
      chunks.push(slice)
      length += slice.byteLength
    }
    if (signal.aborted) throw new DOMException('读取已取消', 'AbortError')
  } finally {
    signal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const merged = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }
  return merged
}

async function fetchFile(url: string, signal: AbortSignal, range?: string): Promise<Response> {
  let response: Response
  try { response = await fetch(url, { credentials: 'include', signal, headers: range ? { Range: range } : {}, redirect: 'error', cache: 'no-store' }) }
  catch (error) {
    if (signal.aborted) throw new DOMException('读取已取消', 'AbortError')
    throw new ApiError('无法连接文件服务，请检查网络后重试', 0)
  }
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw accessError(response.status) }
  const mime = contentType(response)
  if (mime === 'application/json' && !response.headers.has('Content-Disposition')) {
    const bytes = await readCapped(response, 8192, signal)
    let code = 500, message = '文件服务返回了异常响应'
    try {
      const data = JSON.parse(new TextDecoder().decode(bytes)) as { code?: number; message?: string }
      code = data.code || 500
      message = data.message || message
    } catch { /* 不把非预期 JSON 当作可执行预览内容。 */ }
    throw accessError(code, message)
  }
  return response
}
function contentType(response: Response) { return (response.headers.get('Content-Type') || '').split(';')[0]!.trim().toLowerCase() }
function responseSize(response: Response, fallback: number | null) {
  const range = response.headers.get('Content-Range')?.match(/\/(\d+)$/)
  if (range) return Number(range[1])
  const length = response.status === 200 ? response.headers.get('Content-Length') : null
  return length && /^\d+$/.test(length) ? Number(length) : fallback
}
function imageSignature(mime: string, bytes: Uint8Array): boolean {
  const ascii = new TextDecoder('latin1').decode(bytes.subarray(0, 20))
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (mime === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  if (mime === 'image/gif') return ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')
  if (mime === 'image/webp') return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP'
  if (mime === 'image/avif') return ascii.slice(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii.slice(8, 12))
  return false
}
function classify(mime: string, file: FileItem): PreviewMode {
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'].includes(mime)) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'].includes(mime)) return 'audio'
  if (['video/mp4', 'video/webm'].includes(mime)) return 'video'
  if (['text/plain', 'text/html', 'text/css', 'text/javascript', 'application/json', 'application/xml', 'image/svg+xml', 'application/xhtml+xml'].includes(mime)) return 'text'
  if (mime === 'application/octet-stream' && /\.(html?|svg)$/i.test(file.fileName)) return 'text'
  return 'unsupported'
}

/** 探测与文本/图片读取全部有硬上限，媒体交由浏览器按 Range 读取。 */
export async function loadPreview(file: FileItem, provided: string | undefined, signal: AbortSignal): Promise<PreviewContent> {
  const url = safeFileUrl(file.fileId, provided)
  if (file.folderType !== 0 || file.status !== 2) throw new ApiError('文件尚未就绪，暂时无法预览', 600)
  const probe = await fetchFile(url, signal, file.fileSize === 0 ? undefined : 'bytes=0-1023')
  const mime = contentType(probe)
  const size = responseSize(probe, file.fileSize)
  const head = await readCapped(probe, 1024, signal)
  if (size === 0 && head.length === 0) return { mode: 'text', url, mime, text: '', truncated: false }
  const mode = classify(mime, file)
  if (mode === 'unsupported') return { mode, url, mime, message: '此格式暂不支持在线预览，请下载后使用本地应用打开。' }
  if (mode === 'pdf' && new TextDecoder().decode(head.subarray(0, 5)) !== '%PDF-') return { mode: 'unsupported', url, mime, message: '文件内容与 PDF 格式不一致，已停止内嵌预览。' }
  if (mode === 'pdf' && size !== null && size > PDF_PREVIEW_LIMIT) return { mode: 'unsupported', url, mime, message: 'PDF 超过 100 MiB 预览上限，请下载后查看。' }
  if (mode === 'text') {
    const response = await fetchFile(url, signal, `bytes=0-${TEXT_PREVIEW_LIMIT}`)
    const total = responseSize(response, size)
    const bytes = await readCapped(response, TEXT_PREVIEW_LIMIT + 1, signal)
    const truncated = bytes.length > TEXT_PREVIEW_LIMIT || (total !== null && total > TEXT_PREVIEW_LIMIT)
    const text = new TextDecoder('utf-8').decode(bytes.subarray(0, TEXT_PREVIEW_LIMIT), { stream: truncated })
    if (text.includes('\0')) return { mode: 'unsupported', url, mime, message: '内容包含二进制字符或使用了不支持的文本编码，请下载查看。' }
    return { mode, url, mime, text, truncated, sourceText: ['text/html', 'image/svg+xml', 'application/xhtml+xml'].includes(mime) || /\.(html?|svg)$/i.test(file.fileName) }
  }
  if (mode === 'image') {
    if (!imageSignature(mime, head)) return { mode: 'unsupported', url, mime, message: '文件内容与图片格式不一致，已停止图片预览。' }
    if (size !== null && size > IMAGE_PREVIEW_LIMIT) return { mode: 'unsupported', url, mime, message: '图片超过 20 MiB 预览上限，请下载后查看原图。' }
    const response = await fetchFile(url, signal, `bytes=0-${IMAGE_PREVIEW_LIMIT}`)
    const bytes = await readCapped(response, IMAGE_PREVIEW_LIMIT + 1, signal)
    if (bytes.length > IMAGE_PREVIEW_LIMIT || !imageSignature(mime, bytes) || contentType(response) !== mime) return { mode: 'unsupported', url, mime, message: '图片过大或内容已变化，请下载查看。' }
    return { mode, url, mime, image: new Blob([bytes], { type: mime }) }
  }
  return { mode, url, mime }
}

export async function verifyDownload(file: FileItem, provided: string | undefined, signal: AbortSignal): Promise<string> {
  const url = safeFileUrl(file.fileId, provided)
  const response = await fetchFile(url, signal, file.fileSize === 0 ? undefined : 'bytes=0-0')
  await response.body?.cancel().catch(() => {})
  return `${url}?download=true`
}
