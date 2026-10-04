import type { FileItem, FilePage } from '../../../types/files'
import type { PublicShareInfo, SharePage, ShareRecord } from '../types'

export const rootFolder: FileItem = { fileId: 'root', filePid: '0', fileName: '分享资料', fileSize: null, folderType: 1, status: 2, fileCategory: null, fileType: null, lastUpdateTime: '2026-10-05 10:30:00' }
export const report: FileItem = { fileId: 'report', filePid: 'root', fileName: '季度报告.pdf', fileSize: 2048, folderType: 0, status: 2, fileCategory: 4, fileType: 4, lastUpdateTime: '2026-10-05 10:30:00' }
export const publicInfo: PublicShareInfo = { fileName: '分享资料', nickName: '分享者', userId: 'owner', currentUser: false, expireTime: '2099-10-12 10:30:00', shareTime: '2026-10-05 10:30:00' }
export const shareRecord: ShareRecord = { shareId: 'share1', fileId: 'report', userId: 'owner', fileName: '季度报告.pdf', validType: 1, code: 'Ab123', expireTime: '2099-10-12 10:30:00', shareTime: '2026-10-05 10:30:00', showCount: 7, folderType: 0, fileCategory: 4, fileType: 4 }
export function filePage(list: FileItem[] = [rootFolder]): FilePage { return { list, totalCount: list.length, pageNo: 1, pageSize: 20, pageTotal: 1 } }
export function sharePage(list: ShareRecord[] = [shareRecord]): SharePage { return { list, totalCount: list.length, pageNo: 1, pageSize: 20, pageTotal: 1 } }
