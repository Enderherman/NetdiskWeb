import type { ApiResponse } from '../types/api'

export class ApiError extends Error {
  constructor(message: string, public readonly code: number) {
    super(message)
    this.name = 'ApiError'
  }
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

/** 后端使用 Cookie 会话及表单参数。业务接口在各功能版本中接入。 */
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  const response = await fetch(`${baseUrl}/${path.replace(/^\//, '')}`, {
    ...options,
    credentials: 'include',
    headers,
  })
  if (!response.ok) throw new ApiError(`请求失败（${response.status}）`, response.status)
  const body = await response.json() as ApiResponse<T>
  if (body.code !== 200) throw new ApiError(body.message || '操作未完成，请重试', body.code)
  return body.data
}

export function postForm<T>(path: string, fields: Record<string, string>, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'POST', body: new URLSearchParams(fields), signal })
}
