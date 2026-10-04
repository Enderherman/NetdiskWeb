import { flushPromises } from '@vue/test-utils'
import { vi } from 'vitest'
import { accountApi } from '../../../api/account'
import { useAccount } from '../../../composables/account'
import type { FileItem } from '../../../types/files'

export const source: FileItem = { fileId: 'report', filePid: '0', fileName: '报告.pdf', folderType: 0,
  fileSize: 1024, fileCategory: 4, fileType: 4, status: 2, lastUpdateTime: '2026-10-05 10:00:00' }
export const folder: FileItem = { ...source, fileId: 'folder', fileName: '资料', folderType: 1, fileSize: null, fileCategory: null, fileType: null }
export const copied: FileItem = { ...source, fileId: 'copy1', fileName: '报告 (1).pdf' }
export async function signIn() {
  useAccount().clearSession()
  vi.spyOn(accountApi, 'current').mockResolvedValue({ userId: 'alice', nickName: '用户', isAdmin: false, avatar: null })
  vi.spyOn(accountApi, 'space').mockResolvedValue({ useSpace: 1, totalSpace: 1024 })
  await useAccount().ensureSession(true); await flushPromises()
}
