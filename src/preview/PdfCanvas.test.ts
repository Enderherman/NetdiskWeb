import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PDFDocumentLoadingTask, PDFPageProxy } from 'pdfjs-dist'
import PdfCanvas from './PdfCanvas.vue'
import * as renderer from './pdfRenderer'

function documentFixture(numPages = 3, dimensions = { width: 600, height: 800 }) {
  const render = vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() })
  const page = { getViewport: ({ scale }: { scale: number }) => ({ width: dimensions.width * scale, height: dimensions.height * scale }), render, cleanup: vi.fn() } as unknown as PDFPageProxy
  const getPage = vi.fn().mockResolvedValue(page)
  const destroy = vi.fn().mockResolvedValue(undefined)
  const task = { promise: Promise.resolve({ numPages, getPage }), destroy } as unknown as PDFDocumentLoadingTask
  return { task, getPage, render, destroy }
}
beforeEach(() => { vi.spyOn(renderer, 'openPdf') })
describe('PDF安全画布', () => {
  it('按页绘制且禁止批注交互，分页和缩放生效，关闭释放任务', async () => {
    const fixture = documentFixture()
    vi.mocked(renderer.openPdf).mockResolvedValue(fixture.task)
    const wrapper = mount(PdfCanvas, { props: { fileId: 'file123', url: '/api/file/content/file123', title: '报告.pdf' } })
    await flushPromises()
    expect(fixture.getPage).toHaveBeenCalledWith(1)
    expect(fixture.render.mock.calls[0]![0].annotationMode).toBe(0)
    const canvas = wrapper.get('canvas').element
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(renderer.PDF_CANVAS_MAX_PIXELS)
    expect(wrapper.emitted('ready')).toHaveLength(1)
    await wrapper.get('[aria-label="PDF下一页"]').trigger('click')
    await flushPromises()
    expect(fixture.getPage).toHaveBeenLastCalledWith(2)
    const width = canvas.width
    await wrapper.get('[aria-label="放大PDF"]').trigger('click')
    await flushPromises()
    expect(canvas.width).toBeGreaterThan(width)
    wrapper.unmount()
    expect(fixture.destroy).toHaveBeenCalledOnce()
    expect(canvas.width).toBe(0)
  })
  it('超长文档限制预览页数，异常尺寸不能无限申请画布', async () => {
    const fixture = documentFixture(1000, { width: Infinity, height: 1 })
    vi.mocked(renderer.openPdf).mockResolvedValue(fixture.task)
    const wrapper = mount(PdfCanvas, { props: { fileId: 'file123', url: '/api/file/content/file123', title: '报告.pdf' } })
    await flushPromises()
    expect(wrapper.text()).toContain('前 500 页')
    expect(wrapper.get('[role="alert"]').text()).toContain('绘制失败')
    expect(fixture.render).not.toHaveBeenCalled()
  })
  it('关闭后迟到的加载任务立即销毁，不继续绘制', async () => {
    let resolve!: (task: PDFDocumentLoadingTask) => void
    vi.mocked(renderer.openPdf).mockImplementation(() => new Promise(finish => { resolve = finish }))
    const wrapper = mount(PdfCanvas, { props: { fileId: 'file123', url: '/api/file/content/file123', title: '报告.pdf' } })
    wrapper.unmount()
    const fixture = documentFixture()
    resolve(fixture.task)
    await flushPromises()
    expect(fixture.destroy).toHaveBeenCalledOnce()
    expect(fixture.getPage).not.toHaveBeenCalled()
  })
  it('加密PDF明确提示下载查看', async () => {
    vi.mocked(renderer.openPdf).mockRejectedValue(Object.assign(new Error('password'), { name: 'PasswordException' }))
    const wrapper = mount(PdfCanvas, { props: { fileId: 'file123', url: '/api/file/content/file123', title: '加密.pdf' } })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('需要密码')
  })
})
