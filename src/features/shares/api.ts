import { ApiError, baseUrl, postForm, request } from '../../api/client'
import type { FileItem, FilePage } from '../../types/files'
import type { PublicShareInfo, SharePage, ShareRecord, ShareValidity } from './types'

function query(fields: Record<string, string | number>): string {
  const search = new URLSearchParams()
  for (const [name, value] of Object.entries(fields)) search.set(name, String(value))
  return search.toString()
}
function validPage<T extends { list: unknown[]; totalCount: number; pageNo: number; pageTotal: number }>(value: T): T {
  if (!value || !Array.isArray(value.list) || !Number.isFinite(value.totalCount) || value.totalCount < 0
    || !Number.isInteger(value.pageNo) || value.pageNo < 1 || !Number.isInteger(value.pageTotal) || value.pageTotal < 1) {
    throw new ApiError('分享列表响应异常，请重新加载', 0)
  }
  return value
}

export const sharesApi = {
  async create(fileId: string, validType: ShareValidity, code = ''): Promise<ShareRecord> {
    const result = await postForm<ShareRecord>('/share/shareFile', { fileId, validType: String(validType), ...(code ? { code } : {}) })
    if (!result || result.fileId !== fileId || !/^[A-Za-z0-9]{1,20}$/.test(result.shareId) || !/^[A-Za-z0-9]{4,5}$/.test(result.code)) {
      throw new ApiError('分享已提交，但返回信息不完整，请到“我的分享”核对', 0)
    }
    return result
  },
  async list(pageNo = 1, pageSize = 20, signal?: AbortSignal): Promise<SharePage> {
    return validPage(await request<SharePage>(`/share/loadShareList?${query({ pageNo, pageSize })}`, { signal }))
  },
  cancel: (shareIds: string[]) => postForm<null>('/share/cancelShare', { shareIds: shareIds.join(',') }),
  info: (shareId: string, signal?: AbortSignal) => request<PublicShareInfo>(`/showShare/getShareInfo?${query({ shareId })}`, { signal }),
  accessInfo: (shareId: string, signal?: AbortSignal) => request<PublicShareInfo | null>(`/showShare/getShareLoginInfo?${query({ shareId })}`, { signal }),
  checkCode: (shareId: string, code: string) => postForm<null>('/showShare/checkShareCode', { shareId, code }),
  async files(shareId: string, filePid = '0', pageNo = 1, pageSize = 20, signal?: AbortSignal): Promise<FilePage> {
    return validPage(await request<FilePage>(`/showShare/loadFileList?${query({ shareId, filePid, pageNo, pageSize })}`, { signal }))
  },
  folders: (shareId: string, path: string, signal?: AbortSignal) => request<FileItem[]>(`/showShare/getFolderInfo?${query({ shareId, path })}`, { signal }),
  downloadCode: (shareId: string, fileId: string) => postForm<string>(`/showShare/createDownloadUrl/${encodeURIComponent(shareId)}/${encodeURIComponent(fileId)}`, {}),
  save: (shareId: string, shareFileIds: string[], myFolderId: string) => postForm<null>('/showShare/saveShare', { shareId, shareFileIds: shareFileIds.join(','), myFolderId }),
}

export function shareDownloadUrl(code: string): string { return `${baseUrl}/showShare/download/${encodeURIComponent(code)}` }
export function shareContentUrl(shareId: string, fileId: string): string {
  return `${baseUrl}/showShare/content/${encodeURIComponent(shareId)}/${encodeURIComponent(fileId)}`
}

export function shareThumbnailUrl(shareId: string, fileId: string): string { return shareContentUrl(shareId, fileId).replace("/content/", "/thumbnail/") }
