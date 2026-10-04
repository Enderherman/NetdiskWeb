import { ApiError, postForm } from '../api/client'
import { filesApi } from '../api/files'
import { validateFileName } from '../composables/filePresentation'
import type { FileItem, FileListQuery, FilePage } from '../types/files'
import { UPLOAD_CHUNK_SIZE } from './uploadQueue'

export const DIRECTORY_IMPORT_LIMITS = { files: 1000, directories: 500, depth: 16, existingEntries: 10000, totalEntries: 20000, requests: 2000 } as const
export interface ImportDirectory { path: string; parentPath: string; name: string }
export interface ImportFile { file: File; parentPath: string; relativePath: string }
export interface DirectoryPlan { roots: string[]; directories: ImportDirectory[]; files: ImportFile[] }
export interface DirectoryProgress { completed: number; total: number; created: number; reused: number; fileCount: number; roots: string[]; currentPath: string }
export interface PreparedDirectoryFile { file: File; filePid: string; destinationName: string }
export interface DirectoryImportApi {
  list: (query: FileListQuery, signal: AbortSignal) => Promise<FilePage>
  create: (filePid: string, fileName: string, signal: AbortSignal) => Promise<FileItem>
}
export const directoryImportApi: DirectoryImportApi = {
  list: (query, signal) => filesApi.list(query, signal),
  create: (filePid, fileName, signal) => postForm<FileItem>('/file/newFolder', { filePid, fileName }, signal),
}
function nameKey(value: string): string { return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() }
function pathKey(value: string): string { return value.split('/').map(nameKey).join('/') }

/** 先完整校验选区，再允许任何网络写操作。相对路径绝不作为服务器物理路径使用。 */
export function planDirectoryImport(selected: readonly File[]): DirectoryPlan {
  if (!selected.length) throw new ApiError('没有读取到文件；浏览器不会提供空文件夹，请手动新建空目录', 600)
  if (selected.length > DIRECTORY_IMPORT_LIMITS.files) throw new ApiError(`一次最多导入 ${DIRECTORY_IMPORT_LIMITS.files} 个文件，请分批选择`, 600)
  const directories = new Map<string, ImportDirectory>()
  const files: ImportFile[] = []
  const filePaths = new Set<string>()
  const roots = new Set<string>()
  for (const file of selected) {
    const raw = file.webkitRelativePath
    if (!raw || raw.startsWith('/') || raw.includes('\\')) throw new ApiError('选区包含缺少合法相对路径的文件，请使用“选择文件夹”重新选择', 600)
    const parts = raw.split('/').map(part => part.normalize('NFC'))
    if (parts.length < 2 || parts.length - 1 > DIRECTORY_IMPORT_LIMITS.depth) throw new ApiError(`文件夹层级最多 ${DIRECTORY_IMPORT_LIMITS.depth} 层（含选中根目录）`, 600)
    for (const part of parts) {
      const problem = validateFileName(part)
      if (part === '.' || part === '..' || problem) throw new ApiError(`相对路径“${raw}”无效：${problem || '不允许路径穿越'}`, 600)
    }
    if (parts.at(-1) !== file.name.normalize('NFC')) throw new ApiError(`相对路径与文件名称不一致：${raw}`, 600)
    if (Math.max(1, Math.ceil(file.size / UPLOAD_CHUNK_SIZE)) > 10000) throw new ApiError(`${file.name} 超过当前上传队列允许的分片数量`, 600)
    const relativePath = parts.join('/')
    const key = pathKey(relativePath)
    if (filePaths.has(key)) throw new ApiError(`选区含重复或仅大小写/重音不同的文件路径：${relativePath}`, 600)
    filePaths.add(key)
    roots.add(parts[0]!)
    for (let depth = 1; depth < parts.length; depth++) {
      const path = parts.slice(0, depth).join('/')
      const key = pathKey(path)
      const previous = directories.get(key)
      if (previous && previous.path !== path) throw new ApiError(`目录路径存在大小写或重音冲突，请先统一名称：${path}`, 600)
      if (!previous) directories.set(key, { path, parentPath: parts.slice(0, depth - 1).join('/'), name: parts[depth - 1]! })
    }
    if (directories.size > DIRECTORY_IMPORT_LIMITS.directories) throw new ApiError(`一次最多准备 ${DIRECTORY_IMPORT_LIMITS.directories} 个目录，请分批选择`, 600)
    files.push({ file, parentPath: parts.slice(0, -1).join('/'), relativePath })
  }
  for (const key of filePaths) if (directories.has(key)) throw new ApiError('选区中的同一路径同时被用作文件和文件夹，请先整理名称', 600)
  return { roots: [...roots], files, directories: [...directories.values()].sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path)) }
}

export interface DirectoryImportOptions {
  targetId: string
  targetName: string
  ownerId: string
  currentOwner: () => string | undefined
  signal: AbortSignal
  progress?: (value: DirectoryProgress) => void
  api?: DirectoryImportApi
}

export async function prepareDirectoryImport(selected: readonly File[], options: DirectoryImportOptions): Promise<PreparedDirectoryFile[]> {
  const guard = () => {
    if (!options.ownerId || options.currentOwner() !== options.ownerId) throw new ApiError('账号已变化，目录准备已停止；请在当前账号重新选择文件夹', 901)
    if (options.signal.aborted) throw new DOMException('目录准备已停止', 'AbortError')
  }
  guard()
  if (!/^(0|[A-Za-z0-9]{1,10})$/.test(options.targetId)) throw new ApiError('上传目标目录无效', 600)
  const plan = planDirectoryImport(selected)
  const api = options.api || directoryImportApi
  const progress: DirectoryProgress = { completed: 0, total: plan.directories.length, created: 0, reused: 0, fileCount: plan.files.length, roots: plan.roots, currentPath: '' }
  const announce = () => { guard(); options.progress?.({ ...progress, roots: [...progress.roots] }) }
  announce()
  const resolved = new Map<string, { id: string; name: string }>([['', { id: options.targetId, name: options.targetName }]])
  const inventories = new Map<string, Map<string, FileItem>>()
  let totalEntries = 0
  let requestCount = 0
  async function checked<T>(request: () => Promise<T>) {
    guard()
    if (++requestCount > DIRECTORY_IMPORT_LIMITS.requests) throw new ApiError('目录准备请求已达到安全上限，请缩小选区后分批导入', 600)
    try { const result = await request(); guard(); return result }
    catch (reason) { guard(); throw reason }
  }
  async function inventory(parentId: string): Promise<Map<string, FileItem>> {
    const cached = inventories.get(parentId)
    if (cached) return cached
    const entries = new Map<string, FileItem>()
    let expectedPages = 1, seen = 0
    for (let pageNo = 1; pageNo <= expectedPages; pageNo++) {
      const page = await checked(() => api.list({ filePid: parentId, category: 'all', sortField: 'fileName', sortDirection: 'asc', pageNo, pageSize: 100 }, options.signal))
      if (!Array.isArray(page.list) || !Number.isInteger(page.pageTotal) || page.pageTotal < 1) throw new ApiError('目标目录分页异常，请刷新后重试', 600)
      totalEntries += page.list.length
      if (totalEntries > DIRECTORY_IMPORT_LIMITS.totalEntries) throw new ApiError('累计目录读取已达到安全上限，请选择更具体的目标并分批导入', 600)
      if (page.totalCount > DIRECTORY_IMPORT_LIMITS.existingEntries || page.pageTotal > DIRECTORY_IMPORT_LIMITS.existingEntries / 100) throw new ApiError('目标目录条目过多，请选择更具体的目录或分批整理后重试', 600)
      if (page.pageNo !== pageNo) throw new ApiError('目标目录在准备期间发生变化，请重试', 600)
      expectedPages = Math.max(1, page.pageTotal)
      for (const entry of page.list) {
        if (++seen > DIRECTORY_IMPORT_LIMITS.existingEntries || entry.filePid !== parentId) throw new ApiError('目标目录列表异常，请刷新后重试', 600)
        const key = nameKey(entry.fileName)
        const previous = entries.get(key)
        if (previous && previous.fileId !== entry.fileId) throw new ApiError('目标中存在多个同名项，请先整理后重试', 600)
        entries.set(key, entry)
      }
    }
    inventories.set(parentId, entries)
    return entries
  }
  function reusable(entry: FileItem, parentId: string, name: string): FileItem {
    if (entry.folderType !== 1) throw new ApiError(`“${name}”已被同名文件占用，无法创建文件夹；原文件未被覆盖`, 600)
    if (entry.status !== 2 || entry.filePid !== parentId || !/^[A-Za-z0-9]{1,10}$/.test(entry.fileId) || nameKey(entry.fileName) !== nameKey(name)) throw new ApiError(`目录“${name}”不可用或回执异常，请刷新后重试`, 600)
    return entry
  }
  for (const directory of plan.directories) {
    guard()
    progress.currentPath = directory.path
    announce()
    const parent = resolved.get(directory.parentPath)!
    let entries = await inventory(parent.id)
    let node = entries.get(nameKey(directory.name))
    if (node) { node = reusable(node, parent.id, directory.name); progress.reused++ }
    else {
      try {
        node = reusable(await checked(() => api.create(parent.id, directory.name, options.signal)), parent.id, directory.name)
        progress.created++
      } catch (reason) {
        guard()
        if (reason instanceof ApiError && [401, 403, 901].includes(reason.code)) throw reason
        // 请求可能已提交或被并发创建：重新查询，仅凭真实存在的目录恢复。
        inventories.delete(parent.id)
        entries = await inventory(parent.id)
        const actual = entries.get(nameKey(directory.name))
        if (!actual) throw new ApiError(`准备“${directory.path}”失败：${reason instanceof ApiError ? reason.message : '目录请求失败，请重试'}`, reason instanceof ApiError ? reason.code : 0)
        node = reusable(actual, parent.id, directory.name)
        progress.reused++
      }
      entries.set(nameKey(directory.name), node)
    }
    resolved.set(directory.path, { id: node.fileId, name: `${parent.name}/${node.fileName}` })
    progress.completed++
    announce()
  }
  guard()
  return plan.files.map(item => {
    const parent = resolved.get(item.parentPath)!
    return { file: item.file, filePid: parent.id, destinationName: parent.name }
  })
}
