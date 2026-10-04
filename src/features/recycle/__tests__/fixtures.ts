import type { RecycleEntry, RecyclePage, RecyclePolicy } from '../types'

export const policy: RecyclePolicy = { retentionDays: 7, autoCleanupEnabled: true, restoreStrategy: 'original_or_root' }
export const report: RecycleEntry = { fileId: 'report', filePid: 'oldFolder', fileName: '旧报告.pdf', fileSize: 2048, folderType: 0, fileCategory: 4, fileType: 4, status: 2, lastUpdateTime: '2026-09-28 11:00:00', recoveryTime: '2026-10-01 09:30:00' }
export const folder: RecycleEntry = { fileId: 'folder', filePid: '0', fileName: '旧资料', fileSize: null, folderType: 1, fileCategory: null, fileType: null, status: 2, lastUpdateTime: '2026-09-29 12:00:00', recoveryTime: null }
export function result(list: RecycleEntry[] = [report, folder]): RecyclePage { return { list, totalCount: list.length, pageNo: 1, pageSize: 20, pageTotal: 1 } }
