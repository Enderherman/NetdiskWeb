import { createMD5 } from 'hash-wasm'

export const HASH_BLOCK_SIZE = 4 * 1024 * 1024

/** 独立 Worker 内增量处理，任何时刻仅持有一个小块。 */
export async function hashBlob(blob: Blob, progress: (ratio: number) => void): Promise<string> {
  const hash = await createMD5()
  hash.init()
  for (let offset = 0; offset < blob.size; offset += HASH_BLOCK_SIZE) {
    const bytes = await blob.slice(offset, Math.min(blob.size, offset + HASH_BLOCK_SIZE)).arrayBuffer()
    hash.update(new Uint8Array(bytes))
    progress(Math.min(1, (offset + bytes.byteLength) / blob.size))
  }
  progress(1)
  return hash.digest('hex')
}
