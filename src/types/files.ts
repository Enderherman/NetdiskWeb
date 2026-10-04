export type FileCategory = 'all' | 'video' | 'music' | 'image' | 'doc' | 'others'
export type SortField = 'fileName' | 'fileSize' | 'createTime' | 'lastUpdateTime'
export interface FileItem {
  fileId: string
  filePid: string
  fileName: string
  fileSize: number | null
  folderType: 0 | 1
  fileCategory: number | null
  fileType: number | null
  status: 0 | 1 | 2
  lastUpdateTime: string | null
  fileCover?: string | null
}
export interface FilePage { list: FileItem[]; totalCount: number; pageNo: number; pageSize: number; pageTotal: number }
export interface FileListQuery {
  filePid?: string
  category: FileCategory
  fileNameFuzzy?: string
  sortField: SortField
  sortDirection: 'asc' | 'desc'
  pageNo: number
  pageSize: number
}
