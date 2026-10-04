import { ApiError, baseUrl, postForm, request } from '../../api/client'
import type { AdminFile, AdminFileFilters, AdminUser, Page, SystemSettings, UserFilters } from './types'

function query(fields: Record<string, string | number | undefined>) {
  const result = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) if (value !== undefined && value !== '') result.set(key, String(value))
  return result.toString()
}
function page<T>(value: Page<T>): Page<T> {
  if (!value || !Array.isArray(value.list) || !Number.isInteger(value.totalCount) || value.totalCount < 0
    || !Number.isInteger(value.pageNo) || value.pageNo < 1 || !Number.isInteger(value.pageSize) || value.pageSize < 1
    || !Number.isInteger(value.pageTotal) || value.pageTotal < value.pageNo) throw new ApiError('管理列表响应异常，请重新读取', 0)
  return value
}
function nullableText(value: unknown): string | null { return typeof value === 'string' ? value : null }
function storageNumber(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }
function user(value: AdminUser): AdminUser {
  if (!value || typeof value.userId !== 'string' || !value.userId || ![0, 1].includes(value.status)
    || !storageNumber(value.useSpace) || !storageNumber(value.totalSpace)) throw new ApiError('用户资料响应异常，请重新读取', 0)
  return { userId: value.userId, nickName: nullableText(value.nickName), email: nullableText(value.email), status: value.status,
    useSpace: value.useSpace, totalSpace: value.totalSpace, createTime: nullableText(value.createTime), lastLoginTime: nullableText(value.lastLoginTime) }
}
function file(value: AdminFile, owner: string): AdminFile {
  if (!value || typeof value.fileId !== 'string' || typeof value.fileName !== 'string' || value.userId !== owner
    || ![0, 1].includes(value.folderType) || ![0, 1, 2].includes(value.status) || ![0, 1, 2, 3].includes(value.delFlag)
    || (value.fileSize !== null && !storageNumber(value.fileSize))) throw new ApiError('文件所属用户或列表响应异常，请重新读取', 0)
  return { fileId: value.fileId, userId: value.userId, filePid: value.filePid, fileName: value.fileName,
    fileSize: value.fileSize, folderType: value.folderType, fileCategory: value.fileCategory, fileType: value.fileType,
    status: value.status, delFlag: value.delFlag, nickName: nullableText(value.nickName), recoveryTime: nullableText(value.recoveryTime),
    lastUpdateTime: nullableText(value.lastUpdateTime) }
}

export const adminApi = {
  async users(filters: UserFilters, signal?: AbortSignal): Promise<Page<AdminUser>> {
    const { pageNo, pageSize, userId, nickNameFuzzy, emailFuzzy, status } = filters
    const response = page(await request<Page<AdminUser>>(`/admin/loadUserList?${query({ pageNo, pageSize, userId, nickNameFuzzy, emailFuzzy, status })}`, { signal }))
    return { ...response, list: response.list.map(user) }
  },
  changeStatus: (userId: string, status: 0 | 1) => postForm<null>('/admin/updateUserStatus', { userId, status: String(status) }),
  changeSpace: (userId: string, changeSpace: number) => postForm<null>('/admin/updateUserSpace', { userId, changeSpace: String(changeSpace) }),
  async files(filters: AdminFileFilters, signal?: AbortSignal): Promise<Page<AdminFile>> {
    const { userId, pageNo, pageSize, filePid, fileNameFuzzy, delFlag } = filters
    if (!userId) throw new ApiError('请先选择所属用户', 600)
    const response = page(await request<Page<AdminFile>>(`/admin/loadFileList?${query({ userId, pageNo, pageSize, filePid, fileNameFuzzy, delFlag })}`, { signal }))
    return { ...response, list: response.list.map(value => file(value, userId)) }
  },
  deleteFiles: (files: Pick<AdminFile, 'fileId' | 'userId'>[]) => postForm<null>('/admin/delFile', { fileIdAndUserIds: files.map(item => `${item.fileId}_${item.userId}`).join(',') }),
  async downloadCode(userId: string, fileId: string): Promise<string> {
    const code = await postForm<string>(`/admin/createDownloadUrl/${encodeURIComponent(userId)}/${encodeURIComponent(fileId)}`, {})
    if (typeof code !== 'string' || !/^[A-Za-z0-9]{50}$/.test(code)) throw new ApiError('下载链接响应异常，请重试', 0)
    return code
  },
  async system(signal?: AbortSignal): Promise<SystemSettings> {
    const value = await request<SystemSettings>('/admin/getSysSettings', { signal })
    if (!value || typeof value.registerEmailTitle !== 'string' || typeof value.registerEmailContent !== 'string'
      || !Number.isInteger(value.userInitUseSpace) || value.userInitUseSpace < 1) throw new ApiError('系统设置响应异常，请重新读取', 0)
    return { registerEmailTitle: value.registerEmailTitle, registerEmailContent: value.registerEmailContent, userInitUseSpace: value.userInitUseSpace }
  },
  saveSystem: (value: SystemSettings) => postForm<null>('/admin/saveSysSettings', {
    registerEmailTitle: value.registerEmailTitle, registerEmailContent: value.registerEmailContent, userInitUseSpace: String(value.userInitUseSpace),
  }),
}

export function adminContentUrl(userId: string, fileId: string): string { return `${baseUrl}/admin/content/${encodeURIComponent(userId)}/${encodeURIComponent(fileId)}` }
export function adminDownloadUrl(code: string): string { return `${baseUrl}/admin/download/${encodeURIComponent(code)}` }
export const deletionLabels: Record<number, string> = { 0: '随上级回收', 1: '回收站', 2: '正常', 3: '已永久删除' }
export function canRead(file: AdminFile): boolean { return file.folderType === 0 && file.status === 2 && file.delFlag === 2 }

export function quotaError(user: AdminUser, amount: string, direction: 'add' | 'subtract'): string {
  const value = Number(amount)
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) return '请输入 1–2147483647 之间的整数 MB'
  const total = user.totalSpace + value * 1024 * 1024 * (direction === 'add' ? 1 : -1)
  if (!Number.isSafeInteger(total)) return '容量数值过大，请输入较小的调整量'
  if (total < 0 || total < user.useSpace) return '调整后的容量不能小于当前已用空间'
  return ''
}
export function systemError(value: SystemSettings): string {
  if (!value.registerEmailTitle.trim() || value.registerEmailTitle.length > 150 || /[\u0000-\u001f\u007f]/.test(value.registerEmailTitle)) return '邮件标题需为 1–150 字，不能包含控制字符'
  if (!value.registerEmailContent.trim() || value.registerEmailContent.length > 5000 || !value.registerEmailContent.includes('%s')) return '邮件正文不超过 5000 字，并须包含验证码占位符 %s'
  if (!Number.isInteger(value.userInitUseSpace) || value.userInitUseSpace < 1 || value.userInitUseSpace > 1_048_576) return '初始容量需为 1–1048576 之间的整数 MB'
  return ''
}
