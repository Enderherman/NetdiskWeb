import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import FileCollection from '../../components/FileCollection.vue'
import { focusFileElement, useFileFocus } from './useFileFocus'
import { recentFile } from './__tests__/fixtures'

describe('文件定位接线辅助', () => {
  it('按当前页实际顺序滚动与键盘聚焦，不把ID拼入不可信选择器', () => {
    const root = document.createElement('div')
    root.innerHTML = '<table class="file-table"><tbody><tr><td><button class="file-name-button">其他文件</button></td></tr><tr><td><button class="file-name-button">目标文件</button></td></tr></tbody></table>'
    document.body.append(root)
    const target = root.querySelectorAll('tr')[1]!
    const scroll = vi.fn(); target.scrollIntoView = scroll
    expect(focusFileElement(root, [{ ...recentFile, fileId: 'other' }, recentFile], 'report')).toBe(true)
    expect(document.activeElement?.textContent).toBe('目标文件')
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' })
    expect(focusFileElement(root, [recentFile], 'bad"]')).toBe(false)
    root.remove()
  })
  it('列表就绪后选中并聚焦一次，后续刷新不抢焦点', async () => {
    const selected = ref<string[]>([]), items = ref([recentFile]), loading = ref(true), focus = ref<unknown>('report')
    const select = vi.fn((id: string) => { selected.value = [id] })
    const Harness = defineComponent({ components: { FileCollection }, setup() {
      const root = ref<HTMLElement>()
      const { focusError } = useFileFocus({ focus, items, loading, root, select })
      return { root, items, loading, selected, focusError }
    }, template: '<div ref="root"><FileCollection :items="items" :selected="selected" layout="list" /><p>{{ focusError }}</p></div>' })
    const wrapper = mount(Harness, { attachTo: document.body })
    await flushPromises(); expect(select).not.toHaveBeenCalled()
    loading.value = false; await flushPromises()
    expect(select).toHaveBeenCalledWith('report'); expect(wrapper.get('tbody tr').classes()).toContain('selected')
    expect(document.activeElement?.textContent).toContain('最近报告.pdf')
    items.value = [{ ...recentFile }]; await flushPromises(); expect(select).toHaveBeenCalledTimes(1)
  })
  it('目标不在返回页时给出真实提示，不选择第一项冒充定位', async () => {
    const select = vi.fn()
    const Harness = defineComponent({ components: { FileCollection }, setup() {
      const root = ref<HTMLElement>()
      const { focusError } = useFileFocus({ focus: 'missing', items: [recentFile], loading: false, root, select })
      return { root, focusError, items: [recentFile] }
    }, template: '<div ref="root"><FileCollection :items="items" :selected="[]" layout="list" /><p role="alert">{{ focusError }}</p></div>' })
    const wrapper = mount(Harness, { attachTo: document.body }); await flushPromises()
    expect(select).not.toHaveBeenCalled(); expect(wrapper.get('[role="alert"]').text()).toContain('位置或列表已更新')
  })
})
