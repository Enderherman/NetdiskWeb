import type { FileItem } from '../../types/files'

export interface RecycleEntry extends FileItem { recoveryTime: string | null }
export interface RecyclePage {
  list: RecycleEntry[]
  totalCount: number
  pageNo: number
  pageSize: number
  pageTotal: number
}
export interface RecyclePolicy {
  retentionDays: number
  autoCleanupEnabled: boolean
  restoreStrategy: 'original_or_root'
}
export interface ClearRecycleResult { deletedCount: number }
