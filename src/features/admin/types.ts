import type { FileItem } from '../../types/files'

export interface AdminUser {
  userId: string; nickName: string | null; email: string | null; status: 0 | 1
  useSpace: number; totalSpace: number; createTime: string | null; lastLoginTime: string | null
}
export interface AdminFile extends FileItem { userId: string; delFlag: 0 | 1 | 2 | 3; nickName: string | null; recoveryTime: string | null }
export interface Page<T> { list: T[]; totalCount: number; pageNo: number; pageSize: number; pageTotal: number }
export interface UserFilters { pageNo: number; pageSize: number; userId?: string; nickNameFuzzy?: string; emailFuzzy?: string; status?: 0 | 1 }
export interface AdminFileFilters { userId: string; pageNo: number; pageSize: number; filePid?: string; fileNameFuzzy?: string; delFlag?: 0 | 1 | 2 | 3 }
export interface SystemSettings { registerEmailTitle: string; registerEmailContent: string; userInitUseSpace: number }
export function emptyPage<T>(): Page<T> { return { list: [], totalCount: 0, pageNo: 1, pageSize: 20, pageTotal: 1 } }
