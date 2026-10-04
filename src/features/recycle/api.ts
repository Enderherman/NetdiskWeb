import { ApiError, postForm, request } from '../../api/client'
import type { ClearRecycleResult, RecyclePage, RecyclePolicy } from './types'

export const recycleApi = {
  async list(pageNo = 1, pageSize = 20, signal?: AbortSignal): Promise<RecyclePage> {
    const query = new URLSearchParams({ pageNo: String(pageNo), pageSize: String(pageSize) })
    const result = await request<RecyclePage>(`/recycle/loadRecycleList?${query}`, { signal })
    if (!result || !Array.isArray(result.list) || !Number.isInteger(result.totalCount) || result.totalCount < 0
      || !Number.isInteger(result.pageNo) || result.pageNo < 1 || !Number.isInteger(result.pageTotal) || result.pageTotal < 1) {
      throw new ApiError('回收站列表响应异常，请重新加载', 0)
    }
    return result
  },
  async policy(signal?: AbortSignal): Promise<RecyclePolicy> {
    const result = await request<RecyclePolicy>('/recycle/policy', { signal })
    if (!result || !Number.isSafeInteger(result.retentionDays) || result.retentionDays < 0
      || typeof result.autoCleanupEnabled !== 'boolean' || result.restoreStrategy !== 'original_or_root'
      || (result.retentionDays === 0 && result.autoCleanupEnabled)) {
      throw new ApiError('回收站策略响应不完整，暂时无法显示保留期限', 0)
    }
    return result
  },
  recover: (fileIds: string[]) => postForm<null>('/recycle/recoverFile', { fileIds: fileIds.join(',') }),
  remove: (fileIds: string[]) => postForm<null>('/recycle/delFile', { fileIds: fileIds.join(',') }),
  async clear(): Promise<ClearRecycleResult> {
    const result = await postForm<ClearRecycleResult>('/recycle/clear', {})
    if (!result || !Number.isSafeInteger(result.deletedCount) || result.deletedCount < 0) {
      throw new ApiError('清空已提交，但返回结果不完整，请刷新回收站核对', 0)
    }
    return result
  },
}
