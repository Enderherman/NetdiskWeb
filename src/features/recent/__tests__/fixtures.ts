import type { FileItem, FilePage } from '../../../types/files'
export const recentFile: FileItem = { fileId: 'report', filePid: 'nested', fileName: '最近报告.pdf', fileSize: 1024,
  folderType: 0, fileCategory: 4, fileType: 4, status: 2, lastUpdateTime: '2026-10-05 10:00:00' }
export const recentFolder: FileItem = { ...recentFile, fileId: 'nested', filePid: 'rootdir', fileName: '内层目录', folderType: 1, fileSize: null }
export function filePage(list: FileItem[] = [recentFile]): FilePage { return { list, totalCount: list.length, pageNo: 1, pageSize: 20, pageTotal: 1 } }
