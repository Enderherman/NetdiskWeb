import type { FileItem } from '../../types/files'

export type FileEntry = FileItem
export type ShareValidity = 0 | 1 | 2 | 3
export interface ShareRecord {
  shareId: string
  fileId: string
  userId: string
  validType: ShareValidity
  expireTime: string | null
  shareTime: string
  code: string
  showCount: number
  fileName: string | null
  folderType: 0 | 1 | null
  fileCategory: number | null
  fileType: number | null
}
export interface SharePage {
  list: ShareRecord[]
  totalCount: number
  pageNo: number
  pageSize: number
  pageTotal: number
}
export interface PublicShareInfo {
  shareTime: string
  expireTime: string | null
  nickName: string
  fileName: string
  currentUser?: boolean | null
  userId: string
  avatar?: string | null
}
