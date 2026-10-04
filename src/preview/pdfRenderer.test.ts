import { describe, expect, it, vi } from 'vitest'
import { openPdf } from './pdfRenderer'
const pdfMock = vi.hoisted(() => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: vi.fn() }))
vi.mock('pdfjs-dist', () => pdfMock)

describe('PDF解析配置', () => {
  it('使用本地Worker、Cookie、分段请求，关闭XFA、流式读取和自动预取', async () => {
    pdfMock.getDocument.mockReturnValue({ promise: Promise.resolve({}), destroy: vi.fn() })
    await openPdf('file123', '/api/file/content/file123')
    expect(pdfMock.GlobalWorkerOptions.workerSrc).toContain('pdf.worker')
    expect(pdfMock.getDocument).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/file/content/file123', withCredentials: true, enableXfa: false, disableStream: true, disableAutoFetch: true, rangeChunkSize: 65536, maxImageSize: 16000000, useWasm: false }))
  })
  it('解析器入口再次拒绝外部地址', async () => {
    const previous = pdfMock.getDocument.mock.calls.length
    await expect(openPdf('file123', 'https://outside.example/file.pdf')).rejects.toThrow('不属于本站')
    expect(pdfMock.getDocument).toHaveBeenCalledTimes(previous)
  })
})
