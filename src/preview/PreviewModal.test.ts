import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PreviewModal from './PreviewModal.vue'
import * as preview from './previewContent'
import type { FileItem } from '../types/files'
import { ApiError } from '../api/client'
vi.mock('./PdfCanvas.vue', () => ({ default: { props: ['fileId', 'url', 'title'], template: '<section data-testid="safe-pdf-renderer" :data-url="url"><canvas /></section>' } }))

const file: FileItem = { fileId: 'file123', filePid: '0', fileName: '报告.txt', fileSize: 100, folderType: 0, fileType: 7, fileCategory: 4, status: 2, lastUpdateTime: null }
beforeEach(() => {
  vi.spyOn(preview, 'loadPreview').mockResolvedValue({ mode: 'text', url: '/api/file/content/file123', mime: 'text/plain', text: '真实文本内容', truncated: false })
  vi.spyOn(preview, 'verifyDownload').mockResolvedValue('/api/file/content/file123?download=true')
})
async function render(props: { file: FileItem; contentUrl?: string } = { file }) {
  const component = mount(PreviewModal, { props, attachTo: document.body })
  await flushPromises()
  return { component, dom: new DOMWrapper(document.body) }
}

describe('预览对话框', () => {
  it('纯文本与代码始终转义显示，截断提示明确且没有HTML执行节点', async () => {
    const text = '<img src=x onerror="alert(1)"><script>alert(2)</script>'
    vi.mocked(preview.loadPreview).mockResolvedValue({ mode: 'text', url: '/api/file/content/file123', mime: 'text/plain', text, sourceText: true, truncated: true })
    const { dom } = await render()
    expect(dom.get('.text-preview pre').text()).toBe(text)
    expect(dom.get('.text-preview pre').find('img').exists()).toBe(false)
    expect(dom.get('.text-preview pre').find('script').exists()).toBe(false)
    expect(dom.get('.preview-limit').text()).toContain('64 KiB')
    expect(dom.get('.preview-toolbar').text()).toContain('不执行页面内容')
  })
  it('关闭中止未结束的读取，并通过Escape和焦点返回支持键盘使用', async () => {
    let signal!: AbortSignal
    vi.mocked(preview.loadPreview).mockImplementation((_file, _url, nextSignal) => { signal = nextSignal; return new Promise(() => {}) })
    const opener = document.createElement('button'); document.body.append(opener); opener.focus()
    const { component, dom } = await render()
    expect(dom.get('[role="status"]').text()).toContain('正在读取预览')
    const closeButton = dom.get('[aria-label="关闭对话框"]')
    expect(document.activeElement).toBe(closeButton.element)
    await dom.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(component.emitted('close')).toHaveLength(1)
    component.unmount()
    expect(signal.aborted).toBe(true)
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
  it('图片ObjectURL在关闭时释放，图片加载失败显示可理解的错误', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-test')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.mocked(preview.loadPreview).mockResolvedValue({ mode: 'image', url: '/api/file/content/file123', mime: 'image/png', image: new Blob(['png']) })
    const { component, dom } = await render()
    expect(create).toHaveBeenCalledOnce()
    expect(dom.get('.image-preview img').attributes('src')).toBe('blob:preview-test')
    await dom.get('.image-preview img').trigger('error')
    expect(dom.get('[role="alert"]').text()).toContain('图片无法解码')
    component.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:preview-test')
  })
  it('PDF使用受限画布组件，分享内容URL可复用且不建立iframe', async () => {
    const url = '/api/showShare/content/share123/file123'
    vi.mocked(preview.loadPreview).mockResolvedValue({ mode: 'pdf', url, mime: 'application/pdf' })
    const { dom } = await render({ file, contentUrl: url })
    expect(preview.loadPreview).toHaveBeenCalledWith(file, url, expect.any(AbortSignal))
    expect(dom.get('[data-testid="safe-pdf-renderer"]').attributes('data-url')).toBe(url)
    expect(dom.find('canvas').exists()).toBe(true)
    expect(dom.find('iframe').exists()).toBe(false)
  })
  it.each(['audio', 'video'] as const)('原生%s控件加载元数据且不自动播放，关闭停止媒体', async mode => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    vi.mocked(preview.loadPreview).mockResolvedValue({ mode, url: '/api/file/content/file123', mime: mode === 'audio' ? 'audio/mpeg' : 'video/mp4' })
    const { component, dom } = await render()
    expect(dom.get(mode).attributes('controls')).toBeDefined()
    expect(dom.get(mode).attributes('preload')).toBe('metadata')
    expect(dom.get(mode).attributes('autoplay')).toBeUndefined()
    component.unmount()
    expect(pause).toHaveBeenCalled()
    expect(load).toHaveBeenCalled()
  })
  it('权限失败显示错误并发出事件，重新加载可恢复', async () => {
    vi.mocked(preview.loadPreview).mockRejectedValueOnce(new ApiError('分享已失效', 902))
    const { component, dom } = await render()
    expect(dom.get('[role="alert"]').text()).toBe('分享已失效')
    expect(component.emitted('error')?.[0]?.[0]).toMatchObject({ code: 902 })
    await dom.get('.preview-state .secondary-button').trigger('click')
    await flushPromises()
    expect(dom.get('pre').text()).toBe('真实文本内容')
  })
  it('不支持格式可下载，提示只说发起请求而不冒充下载完成', async () => {
    vi.mocked(preview.loadPreview).mockResolvedValue({ mode: 'unsupported', url: '/api/file/content/file123', mime: 'application/octet-stream', message: '请下载后使用本地应用打开' })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { dom } = await render()
    await dom.get('.modal-footer .primary-button').trigger('click')
    await flushPromises()
    expect(preview.verifyDownload).toHaveBeenCalledWith(file, undefined, expect.any(AbortSignal))
    expect(click).toHaveBeenCalledOnce()
    expect(dom.get('.preview-download-notice').text()).toContain('已发起下载')
  })
})
