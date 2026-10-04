import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { DIRECTORY_IMPORT_LIMITS, directoryImportApi, planDirectoryImport, prepareDirectoryImport } from './directoryImport'
import type { DirectoryImportApi, DirectoryProgress } from './directoryImport'
import type { FileItem, FilePage } from '../types/files'

function selected(path: string, contents = 'content', name = path.split('/').at(-1) || 'file.txt'): File {
  const file = new File([contents], name)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}
function folder(id: string, name: string, parent = '0'): FileItem {
  return { fileId: id, filePid: parent, fileName: name, fileSize: null, folderType: 1, fileCategory: null, fileType: null, status: 2, lastUpdateTime: null }
}
function page(list: FileItem[], pageNo = 1, total = list.length): FilePage {
  return { list, totalCount: total, pageNo, pageSize: 100, pageTotal: Math.max(1, Math.ceil(total / 100)) }
}
function setup(initial: FileItem[] = []) {
  const records = [...initial]
  let sequence = 0
  const api: DirectoryImportApi = {
    list: vi.fn(async query => {
      const entries = records.filter(item => item.filePid === query.filePid)
      return page(entries.slice((query.pageNo - 1) * 100, query.pageNo * 100), query.pageNo, entries.length)
    }),
    create: vi.fn(async (parent, name) => {
      const result = folder(`dir${String(++sequence).padStart(7, '0')}`, name, parent)
      records.push(result)
      return result
    }),
  }
  const controller = new AbortController()
  const current = { owner: 'owner1' as string | undefined }
  const progress: DirectoryProgress[] = []
  const options = { targetId: '0', targetName: '全部文件', ownerId: 'owner1', currentOwner: () => current.owner, signal: controller.signal, api, progress: (value: DirectoryProgress) => progress.push(value) }
  return { api, records, controller, current, progress, options }
}

describe('文件夹导入规划', () => {
  it('合法混合根保持独立树，共享目录只规划一次，同名文件在不同目录可保留', () => {
    const plan = planDirectoryImport([selected('照片/旅行/同名.txt'), selected('照片/旅行/空.txt', ''), selected('文档/同名.txt')])
    expect(plan.roots).toEqual(['照片', '文档'])
    expect(plan.directories.map(item => item.path)).toEqual(expect.arrayContaining(['照片', '文档', '照片/旅行']))
    expect(plan.directories).toHaveLength(3)
    expect(plan.files).toHaveLength(3)
    expect(plan.files[1]!.file.size).toBe(0)
  })
  it.each(['/root/a.txt', 'root/../a.txt', 'root/./a.txt', 'root//a.txt', 'root\\a.txt', 'C:/root/a.txt', 'root/CON.txt'])('拒绝非法相对路径：%s', path => {
    expect(() => planDirectoryImport([selected(path)])).toThrow()
  })
  it('拒绝普通文件与目录选区混入、名称不符、重复文件和目录大小写冲突', () => {
    expect(() => planDirectoryImport([selected('root/a.txt'), new File(['x'], 'b.txt')])).toThrow('相对路径')
    expect(() => planDirectoryImport([selected('root/a.txt', 'x', 'other.txt')])).toThrow('名称不一致')
    expect(() => planDirectoryImport([selected('root/a.txt'), selected('root/a.txt')])).toThrow('重复')
    expect(() => planDirectoryImport([selected('Root/a.txt'), selected('root/b.txt')])).toThrow('目录路径存在')
    expect(() => planDirectoryImport([selected('root/sub', 'x', 'sub'), selected('root/sub/a.txt')])).toThrow('同时被用作文件和文件夹')
  })
  it('在任何写入之前限制深度、文件数和目录数，空目录明确无法取得', () => {
    expect(() => planDirectoryImport([])).toThrow('空文件夹')
    expect(() => planDirectoryImport([selected(`${Array(17).fill('层').join('/')}/a.txt`)])).toThrow('16')
    expect(() => planDirectoryImport(Array.from({ length: 1001 }, (_, index) => selected(`root/${index}.txt`)))).toThrow('1000')
    expect(() => planDirectoryImport(Array.from({ length: 501 }, (_, index) => selected(`root${index}/a.txt`)))).toThrow('500')
  })
})

describe('真实目录ID准备协议', () => {
  it('创建接口携带Cookie、表单与AbortSignal，不传可伪造的所属用户字段', async () => {
    const controller = new AbortController()
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 200, data: folder('newDir', '中文目录', 'parent') })))
    await directoryImportApi.create('parent', '中文目录', controller.signal)
    expect(fetch).toHaveBeenCalledWith('/api/file/newFolder', expect.objectContaining({ method: 'POST', signal: controller.signal, credentials: 'include' }))
    const fields = fetch.mock.calls[0]![1]?.body as URLSearchParams
    expect(fields.get('filePid')).toBe('parent')
    expect(fields.get('fileName')).toBe('中文目录')
    expect(fields.has('userId')).toBe(false)
  })
  it('按层级创建、复用已存在文件夹，把文件关联到真实父ID', async () => {
    const context = setup([folder('existing', '照片')])
    const prepared = await prepareDirectoryImport([selected('照片/旅行/同名.txt'), selected('文档/同名.txt'), selected('照片/旅行/空.txt', '')], context.options)
    const trip = context.records.find(item => item.fileName === '旅行')!
    const docs = context.records.find(item => item.fileName === '文档')!
    expect(trip.filePid).toBe('existing')
    expect(prepared.map(item => item.filePid)).toEqual([trip.fileId, docs.fileId, trip.fileId])
    expect(prepared[0]!.destinationName).toBe('全部文件/照片/旅行')
    expect(context.api.create).toHaveBeenCalledTimes(2)
    expect(context.progress.at(-1)).toMatchObject({ completed: 3, total: 3, created: 2, reused: 1, fileCount: 3 })
  })
  it('目标同名普通文件阻止创建，原文件不被覆盖', async () => {
    const occupied = { ...folder('occupied', '照片'), folderType: 0 as const, fileSize: 7 }
    const context = setup([occupied])
    await expect(prepareDirectoryImport([selected('照片/a.txt')], context.options)).rejects.toThrow('同名文件占用')
    expect(context.api.create).not.toHaveBeenCalled()
    expect(context.records).toEqual([occupied])
  })
  it('整个选区先校验，后面的非法路径不会留下前面的目录', async () => {
    const context = setup()
    await expect(prepareDirectoryImport([selected('合法/a.txt'), selected('非法/../b.txt')], context.options)).rejects.toThrow()
    expect(context.api.list).not.toHaveBeenCalled()
    expect(context.api.create).not.toHaveBeenCalled()
  })
  it('部分创建失败不返回上传清单，重试重新查询并复用已创建的目录', async () => {
    const context = setup()
    const create = vi.mocked(context.api.create).getMockImplementation()!
    vi.mocked(context.api.create).mockImplementationOnce(create).mockRejectedValueOnce(new ApiError('临时失败', 500))
    const files = [selected('root/sub/a.txt')]
    await expect(prepareDirectoryImport(files, context.options)).rejects.toThrow('临时失败')
    expect(context.records.filter(item => item.fileName === 'root')).toHaveLength(1)
    expect(context.progress.at(-1)?.completed).toBe(1)
    const prepared = await prepareDirectoryImport(files, context.options)
    expect(context.records.filter(item => item.fileName === 'root')).toHaveLength(1)
    expect(prepared).toHaveLength(1)
    expect(context.progress.at(-1)).toMatchObject({ created: 1, reused: 1, completed: 2 })
  })
  it('创建回执丢失时只在读回真实目录后恢复，不盲目重复创建', async () => {
    const context = setup()
    const create = vi.mocked(context.api.create).getMockImplementation()!
    vi.mocked(context.api.create).mockImplementationOnce(async (...args) => { await create(...args); throw new ApiError('回执丢失', 0) })
    const prepared = await prepareDirectoryImport([selected('root/a.txt')], context.options)
    expect(prepared[0]!.filePid).toBe(context.records[0]!.fileId)
    expect(context.api.create).toHaveBeenCalledOnce()
    expect(context.progress.at(-1)).toMatchObject({ created: 0, reused: 1, completed: 1 })
  })
  it('鉴权失败不会通过重查目录被掩盖成成功', async () => {
    const context = setup()
    vi.mocked(context.api.create).mockRejectedValueOnce(new ApiError('无权限', 403))
    await expect(prepareDirectoryImport([selected('root/a.txt')], context.options)).rejects.toMatchObject({ code: 403 })
    expect(context.api.list).toHaveBeenCalledOnce()
    expect(context.progress.at(-1)?.completed).toBe(0)
  })
  it('停止后到达的创建回执不会被当作目录准备完成', async () => {
    const context = setup()
    let finish!: (file: FileItem) => void
    vi.mocked(context.api.create).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const result = prepareDirectoryImport([selected('root/a.txt')], context.options)
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await flushPromises()
    context.controller.abort()
    finish(folder('lateFolder', 'root'))
    await rejected
    expect(context.progress.at(-1)?.completed).toBe(0)
    expect(context.api.create).toHaveBeenCalledOnce()
  })
  it('账号在读取或创建期间变化，拒绝旧清单并停止后续写入', async () => {
    const context = setup()
    let finish!: (result: FilePage) => void
    vi.mocked(context.api.list).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const result = prepareDirectoryImport([selected('root/a.txt')], context.options)
    const rejected = expect(result).rejects.toMatchObject({ code: 901 })
    context.current.owner = 'owner2'
    finish(page([]))
    await rejected
    expect(context.api.create).not.toHaveBeenCalled()
    await expect(prepareDirectoryImport([selected('root/a.txt')], context.options)).rejects.toThrow('账号已变化')
  })
  it('账号切换后才到达的创建回执不触发下一层创建或返回上传清单', async () => {
    const context = setup()
    let finish!: (result: FileItem) => void
    vi.mocked(context.api.create).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const result = prepareDirectoryImport([selected('root/sub/a.txt')], context.options)
    const rejected = expect(result).rejects.toMatchObject({ code: 901 })
    await flushPromises()
    context.current.owner = 'owner2'
    finish(folder('oldRoot', 'root'))
    await rejected
    expect(context.api.create).toHaveBeenCalledTimes(1)
    expect(context.progress.at(-1)?.completed).toBe(0)
  })
  it('累计库存读取有全局上限，不会缓存每目录一万条乘以目录总数', async () => {
    const context = setup()
    vi.mocked(context.api.list).mockImplementation(async query => {
      if (query.filePid === '0') return page([folder('rootA', 'A'), folder('rootB', 'B')])
      const start = (query.pageNo - 1) * 100
      const entries = Array.from({ length: 100 }, (_, index) => ({ ...folder(`${query.filePid}${start + index}`, `entry${start + index}.txt`, query.filePid), folderType: 0 as const }))
      if (query.pageNo === 1) entries[0] = folder(`sub${query.filePid}`, 'sub', query.filePid) as typeof entries[0]
      return page(entries, query.pageNo, 10000)
    })
    await expect(prepareDirectoryImport([selected('A/sub/a.txt'), selected('B/sub/b.txt')], context.options)).rejects.toThrow('累计目录读取')
    expect(context.api.create).not.toHaveBeenCalled()
    expect(vi.mocked(context.api.list).mock.calls.length).toBeLessThanOrEqual(202)
  })
  it('异常空分页也不能制造无限请求，全任务最多2000次API请求', async () => {
    const context = setup()
    vi.mocked(context.api.list).mockImplementation(async query => ({ list: [], totalCount: 10000, pageNo: query.pageNo, pageTotal: 100, pageSize: 100 }))
    const files = Array.from({ length: 40 }, (_, index) => selected(`root/d${index}/inner/a.txt`))
    await expect(prepareDirectoryImport(files, context.options)).rejects.toThrow('请求已达到安全上限')
    expect(vi.mocked(context.api.list).mock.calls.length + vi.mocked(context.api.create).mock.calls.length).toBe(DIRECTORY_IMPORT_LIMITS.requests)
  })
})
