import { ApiError, baseUrl, postForm, request, SESSION_EXPIRED_EVENT } from './client'
import type { ApiResponse } from '../types/api'
import type { ServerUploadState, ServerUploadTask, UploadChunk, UploadReply, UploadTaskPage } from '../types/uploads'

export const uploadsApi = {
  list: (pageNo = 1, state?: ServerUploadState) => request<UploadTaskPage>(`/file/uploadTasks?pageNo=${pageNo}&pageSize=20${state ? `&state=${state}` : ''}`),
  detail: (fileId: string) => request<ServerUploadTask>(`/file/uploadTask/${encodeURIComponent(fileId)}`),
  cancel: (fileId: string) => postForm<ServerUploadTask>(`/file/cancelUpload/${encodeURIComponent(fileId)}`, {}),
  sendChunk,
}

/** XHR 上传进度仅表示传输进度；最终状态必须以服务端 JSON 回执为准。 */
export function sendChunk(chunk: UploadChunk, signal: AbortSignal, onProgress: (bytes: number) => void): Promise<UploadReply> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('已暂停', 'AbortError')); return }
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${baseUrl}/file/uploadFile`)
    xhr.withCredentials = true
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.timeout = 120_000
    const form = new FormData()
    if (chunk.fileId) form.append('fileId', chunk.fileId)
    for (const [key, value] of Object.entries({ fileName: chunk.fileName, filePid: chunk.filePid, fileMd5: chunk.fileMd5, chunkIndex: chunk.chunkIndex, chunks: chunk.chunks })) form.append(key, String(value))
    form.append('file', chunk.blob, chunk.fileName)
    const abort = () => xhr.abort()
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.min(chunk.blob.size, Math.round(event.loaded / event.total * chunk.blob.size))) }
    xhr.onload = () => {
      cleanup()
      if (xhr.status < 200 || xhr.status >= 300) { reject(new ApiError(`上传请求失败（${xhr.status}）`, xhr.status)); return }
      try {
        const response = JSON.parse(xhr.responseText) as ApiResponse<UploadReply>
        if (response.code === 901) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
        if (response.code !== 200) { reject(new ApiError(response.message || '上传未完成，请重试', response.code)); return }
        if (!response.data || !/^[A-Za-z0-9]{10}$/.test(response.data.fileId) || !['uploading', 'upload_finish', 'upload_seconds'].includes(response.data.status)) {
          reject(new ApiError('上传回执异常，请刷新服务器任务后确认状态', 0)); return
        }
        resolve(response.data)
      } catch { reject(new ApiError('上传回执无法读取，请刷新服务器任务后确认状态', 0)) }
    }
    xhr.onerror = () => { cleanup(); reject(new ApiError('上传连接中断，请确认服务器任务状态后重试', 0)) }
    xhr.ontimeout = () => { cleanup(); reject(new ApiError('上传等待超时，请确认服务器任务状态后重试', 0)) }
    xhr.onabort = () => { cleanup(); reject(new DOMException('已暂停', 'AbortError')) }
    xhr.send(form)
  })
}
