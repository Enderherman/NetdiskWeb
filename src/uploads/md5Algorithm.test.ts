import { Blob as NodeBlob } from 'node:buffer'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { HASH_BLOCK_SIZE, hashBlob } from './md5Algorithm'

describe('增量文件MD5', () => {
  it('空文件和已知向量返回准确的整文件MD5', async () => {
    expect(await hashBlob(new NodeBlob([]) as unknown as Blob, () => {})).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(await hashBlob(new NodeBlob(['abc']) as unknown as Blob, () => {})).toBe('900150983cd24fb0d6963f7d28e17f72')
  })
  it('跨多个块得到正确摘要且从不读取整文件arrayBuffer', async () => {
    const bytes = new Uint8Array(HASH_BLOCK_SIZE * 2 + 7).fill(42)
    const blob = new NodeBlob([bytes])
    const originalSlice = blob.slice.bind(blob)
    const slices = vi.spyOn(blob, 'slice').mockImplementation((start, end) => {
      expect((end || blob.size) - (start || 0)).toBeLessThanOrEqual(HASH_BLOCK_SIZE)
      return originalSlice(start, end)
    })
    vi.spyOn(blob, 'arrayBuffer').mockRejectedValue(new Error('不能整文件读取'))
    const progress = vi.fn()
    expect(await hashBlob(blob as unknown as Blob, progress)).toBe(createHash('md5').update(bytes).digest('hex'))
    expect(slices).toHaveBeenCalledTimes(3)
    expect(progress).toHaveBeenLastCalledWith(1)
  })
})
