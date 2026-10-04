import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { filesApi } from '../api/files'
import { ApiError } from '../api/client'
import DriveView from './DriveView.vue'
import type { FileItem, FilePage } from '../types/files'
import { loadPreview } from '../preview/previewContent'
import * as previewContent from '../preview/previewContent'
vi.mock('../preview/PdfCanvas.vue', () => ({ default: { props: ['fileId', 'url', 'title'], template: '<canvas data-testid="pdf-canvas" :data-url="url" />' } }))

const folder: FileItem = { fileId: 'folderA', filePid: '0', fileName: '工作文档', folderType: 1, fileCategory: null, fileType: null, fileSize: null, status: 2, lastUpdateTime: '2026-10-04 10:30:00' }
const report: FileItem = { fileId: 'report', filePid: '0', fileName: '季度报告.pdf', folderType: 0, fileCategory: 4, fileType: 4, fileSize: 1024, status: 2, lastUpdateTime: '2026-10-04 11:30:00' }
function result(list = [folder, report]): FilePage { return { list, totalCount: list.length, pageNo: 1, pageSize: 20, pageTotal: 1 } }
beforeEach(() => {
  vi.spyOn(filesApi, 'list').mockResolvedValue(result())
  vi.spyOn(filesApi, 'breadcrumbs').mockResolvedValue([folder])
  vi.spyOn(filesApi, 'folders').mockResolvedValue([])
})
async function renderDrive(path = '/drive') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/drive', component: DriveView }] })
  await router.push(path)
  mount(DriveView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper: new DOMWrapper(document.body), router }
}

describe('文件浏览与组织', () => {
  it('定位参数在真实列表就绪后选中目标并放置键盘焦点', async () => {
    const { wrapper } = await renderDrive('/drive?focus=report')
    await flushPromises()
    expect((wrapper.get('[aria-label="选择 季度报告.pdf"]').element as HTMLInputElement).checked).toBe(true)
    expect(document.activeElement?.textContent).toContain('季度报告.pdf')
    expect(wrapper.get('.selection-toolbar').isVisible()).toBe(true)
  })
  it('点击普通文件打开预览，独立详情操作仍保留', async () => {
    vi.spyOn(previewContent, 'loadPreview').mockResolvedValue({ mode: 'pdf', url: '/api/file/content/report', mime: 'application/pdf' })
    const { wrapper } = await renderDrive()
    await wrapper.findAll('.file-name-button')[1]!.trigger('click')
    await flushPromises()
    expect(loadPreview).toHaveBeenCalledWith(report, undefined, expect.any(AbortSignal))
    expect(wrapper.get('[data-testid="pdf-canvas"]').attributes('data-url')).toBe('/api/file/content/report')
    expect(wrapper.find('[aria-label="季度报告.pdf 的详情和操作"]').exists()).toBe(true)
  })
  it('展示真实返回列表，在网格间切换并保存布局偏好', async () => {
    const { wrapper } = await renderDrive()
    expect(filesApi.list).toHaveBeenCalledWith(expect.objectContaining({ filePid: '0', category: 'all', pageNo: 1 }), expect.any(AbortSignal))
    expect(wrapper.get('.file-table').text()).toContain('季度报告.pdf')
    expect(wrapper.get('.file-table').text()).toContain('1.0 KB')
    await wrapper.get('[aria-label="网格视图"]').trigger('click')
    expect(wrapper.findAll('.file-card')).toHaveLength(2)
    expect(localStorage.getItem('netdisk.file-layout')).toBe('grid')
    await wrapper.get('[aria-label="列表视图"]').trigger('click')
    expect(wrapper.find('.file-table').exists()).toBe(true)
  })

  it('分类搜索跨全部目录，并仅传递公开排序与分页字段', async () => {
    const { wrapper, router } = await renderDrive('/drive?path=folderA')
    await wrapper.get('input[aria-label="搜索全部文件"]').setValue('100%_报告')
    await wrapper.get('form[role="search"]').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.query.path).toBeUndefined()
    expect(filesApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ filePid: undefined, fileNameFuzzy: '100%_报告' }), expect.any(AbortSignal))
    await wrapper.get('#file-sort').setValue('fileName')
    await flushPromises()
    await wrapper.get('.sort-direction').trigger('click')
    await flushPromises()
    await wrapper.get('#page-size').setValue('50')
    await flushPromises()
    expect(filesApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ sortField: 'fileName', sortDirection: 'asc', pageSize: 50, pageNo: 1 }), expect.any(AbortSignal))
    await wrapper.findAll('.category-tabs button')[2]!.trigger('click')
    await flushPromises()
    expect(filesApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'image', filePid: undefined }), expect.any(AbortSignal))
  })

  it('目录路径可刷新恢复，点击面包屑返回根目录', async () => {
    const { wrapper, router } = await renderDrive('/drive?path=folderA')
    expect(filesApi.breadcrumbs).toHaveBeenCalledWith('folderA', expect.any(AbortSignal))
    expect(wrapper.get('[aria-label="当前文件路径"]').text()).toContain('工作文档')
    await wrapper.get('[aria-label="当前文件路径"] button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.path).toBeUndefined()
    await wrapper.get('.file-name-button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.path).toBe('folderA')
  })

  it('新建失败保留输入并可重试，成功后刷新列表', async () => {
    const create = vi.spyOn(filesApi, 'createFolder').mockRejectedValueOnce(new ApiError('名称已经存在', 600)).mockResolvedValueOnce(folder)
    const { wrapper } = await renderDrive()
    await wrapper.get('.page-actions .secondary-button').trigger('click')
    await wrapper.get('#file-name').setValue('工作文档')
    await wrapper.get('.modal-footer .primary-button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.modal-panel [role="alert"]').text()).toBe('名称已经存在')
    expect((wrapper.get('#file-name').element as HTMLInputElement).value).toBe('工作文档')
    await wrapper.get('.modal-footer .primary-button').trigger('click')
    await flushPromises()
    expect(create).toHaveBeenLastCalledWith('0', '工作文档')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.get('.drive-notice').text()).toContain('文件夹已创建')
  })

  it('重命名保留并提交完整扩展名，非法名称阻止请求', async () => {
    const rename = vi.spyOn(filesApi, 'rename').mockResolvedValue({ ...report, fileName: '新报告.pdf' })
    const { wrapper } = await renderDrive()
    await wrapper.get('[aria-label="选择 季度报告.pdf"]').setValue(true)
    await wrapper.get('.selection-toolbar button').trigger('click')
    expect((wrapper.get('#file-name').element as HTMLInputElement).value).toBe('季度报告.pdf')
    await wrapper.get('#file-name').setValue('../错名.pdf')
    await wrapper.get('.modal-footer .primary-button').trigger('click')
    expect(rename).not.toHaveBeenCalled()
    expect(wrapper.get('.modal-panel [role="alert"]').text()).toContain('路径分隔符')
    await wrapper.get('#file-name').setValue('新报告.pdf')
    await wrapper.get('.modal-footer .primary-button').trigger('click')
    await flushPromises()
    expect(rename).toHaveBeenCalledWith('report', '新报告.pdf')
  })

  it('批量删除必须确认，取消不发送，成功后清空选择并显示空状态', async () => {
    const recycle = vi.spyOn(filesApi, 'recycle').mockResolvedValue(null)
    const { wrapper } = await renderDrive()
    await wrapper.get('[aria-label="选择当前页全部文件"]').setValue(true)
    const openDelete = async () => wrapper.findAll('.selection-toolbar button').find(button => button.text() === '移入回收站')!.trigger('click')
    await openDelete()
    expect(wrapper.get('.dialog-description').text()).toContain('不会立即永久删除')
    await wrapper.get('.modal-footer .secondary-button').trigger('click')
    expect(recycle).not.toHaveBeenCalled()
    await openDelete()
    vi.mocked(filesApi.list).mockResolvedValue(result([]))
    await wrapper.get('.modal-footer .primary-button').trigger('click')
    await flushPromises()
    expect(recycle).toHaveBeenCalledWith(['folderA', 'report'])
    expect(wrapper.find('.selection-toolbar').isVisible()).toBe(false)
    expect(wrapper.get('.empty-files').text()).toContain('这里，等着新的开始')
  })

  it('移动目标排除所选目录，并逐级传递目标，确认后移动全部选中项', async () => {
    const target = { ...folder, fileId: 'target', fileName: '归档' }
    vi.mocked(filesApi.folders).mockResolvedValueOnce([folder, target]).mockResolvedValueOnce([])
    const move = vi.spyOn(filesApi, 'move').mockResolvedValue(null)
    const { wrapper } = await renderDrive()
    await wrapper.get('[aria-label="选择当前页全部文件"]').setValue(true)
    await wrapper.findAll('.selection-toolbar button').find(button => button.text() === '移动')!.trigger('click')
    await flushPromises()
    expect(filesApi.folders).toHaveBeenCalledWith('0', ['folderA', 'report'], expect.any(AbortSignal))
    expect(wrapper.findAll('.picker-folders button')).toHaveLength(1)
    expect(wrapper.get('.picker-folders button').text()).toBe('归档')
    await wrapper.get('.picker-folders button').trigger('click')
    await flushPromises()
    expect(filesApi.folders).toHaveBeenLastCalledWith('target', ['folderA', 'report'], expect.any(AbortSignal))
    await wrapper.get('.modal-footer .primary-button').trigger('click')
    await flushPromises()
    expect(move).toHaveBeenCalledWith(['folderA', 'report'], 'target')
  })

  it('详情使用真实元数据，下载通过短码交给浏览器，不把整个文件读入内存', async () => {
    vi.spyOn(filesApi, 'downloadCode').mockResolvedValue('short-code')
    let clickedHref = '', clickedName = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clickedHref = this.getAttribute('href') || ''; clickedName = this.download })
    const { wrapper } = await renderDrive()
    await wrapper.get('[aria-label="季度报告.pdf 的详情和操作"]').trigger('click')
    expect(wrapper.get('.file-details').text()).toContain('PDF')
    expect(wrapper.get('.file-details').text()).toContain('1.0 KB')
    await wrapper.get('.detail-actions .primary-button').trigger('click')
    await flushPromises()
    expect(filesApi.downloadCode).toHaveBeenCalledWith('report')
    expect(clickedHref).toBe('/api/file/download/short-code')
    expect(clickedName).toBe('季度报告.pdf')
  })

  it('加载失败不显示假列表，重试恢复且分页按接口返回边界', async () => {
    vi.mocked(filesApi.list).mockRejectedValueOnce(new ApiError('连接中断', 0)).mockResolvedValueOnce({ ...result(), totalCount: 21, pageTotal: 2 })
    const { wrapper, router } = await renderDrive()
    expect(wrapper.get('[role="alert"]').text()).toBe('连接中断')
    expect(wrapper.find('.file-table').exists()).toBe(false)
    await wrapper.get('.files-state .secondary-button').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="下一页"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.page).toBe('2')
    expect(filesApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ pageNo: 2 }), expect.any(AbortSignal))
  })

  it('较早请求的迟到结果不能覆盖新的搜索结果', async () => {
    let finishOld!: (page: FilePage) => void
    vi.mocked(filesApi.list).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    const { wrapper, router } = await renderDrive()
    vi.mocked(filesApi.list).mockResolvedValue(result([report]))
    await router.push('/drive?q=报告')
    await flushPromises()
    finishOld(result([folder]))
    await flushPromises()
    expect(wrapper.get('.file-table').text()).toContain('季度报告.pdf')
    expect(wrapper.get('.file-table').text()).not.toContain('工作文档')
  })

  it('写入期间禁止重复提交和关闭，完成后恢复可操作状态', async () => {
    let finish!: (file: FileItem) => void
    const create = vi.spyOn(filesApi, 'createFolder').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { wrapper } = await renderDrive()
    await wrapper.get('.page-actions .secondary-button').trigger('click')
    await wrapper.get('#file-name').setValue('新文件夹')
    await wrapper.get('#name-form').trigger('submit')
    await wrapper.get('#name-form').trigger('submit')
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(create).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.modal-footer .primary-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    finish(folder)
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('目录对话框聚焦输入，Tab循环且Escape关闭后恢复触发按钮焦点', async () => {
    const { wrapper } = await renderDrive()
    const opener = wrapper.get('.page-actions .secondary-button')
    ;(opener.element as HTMLButtonElement).focus()
    await opener.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('#file-name').element)
    const last = wrapper.get('.modal-footer .primary-button')
    ;(last.element as HTMLButtonElement).focus()
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(wrapper.get('[aria-label="关闭对话框"]').element)
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(opener.element)
  })
})
