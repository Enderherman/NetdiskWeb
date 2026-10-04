import { nextTick, onBeforeUnmount, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { FileItem } from '../../types/files'
import { validId } from './api'

export function focusFileElement(root: HTMLElement, items: readonly FileItem[], fileId: string): boolean {
  if (!validId(fileId)) return false
  const index = items.findIndex(file => file.fileId === fileId)
  if (index < 0) return false
  const rows = root.querySelectorAll<HTMLElement>('.file-table tbody tr, .file-grid .file-card')
  const row = rows[index]
  const button = row?.querySelector<HTMLButtonElement>('.file-name-button, .file-card-open')
  if (!row || !button) return false
  row.scrollIntoView?.({ block: 'center', behavior: 'auto' })
  button.focus({ preventScroll: true })
  return true
}

/** 在 Drive 中接线：列表就绪后选中并聚焦一次；刷新列表不会反复抢走焦点。 */
export function useFileFocus(options: {
  focus: MaybeRefOrGetter<unknown>; items: MaybeRefOrGetter<readonly FileItem[]>; loading: MaybeRefOrGetter<boolean>
  root: Ref<HTMLElement | undefined | null>; select: (id: string) => void
}) {
  const error = ref('')
  let generation = 0, consumed = '', disposed = false
  watch(() => [toValue(options.focus), toValue(options.items), toValue(options.loading), options.root.value] as const, async ([id, items, loading, root]) => {
    const request = ++generation
    if (!validId(id)) { consumed = ''; error.value = ''; return }
    if (consumed === id || loading || !root) return
    if (!items.some(file => file.fileId === id)) { error.value = '文件位置或列表已更新，请重新从最近文件中定位'; return }
    await nextTick()
    if (disposed || generation !== request) return
    options.select(id)
    if (focusFileElement(root, items, id)) { consumed = id; error.value = '' }
    else error.value = '所在目录已打开，请在列表中选择该文件'
  }, { immediate: true, flush: 'post' })
  onBeforeUnmount(() => { disposed = true; generation++ })
  return { focusError: error }
}
