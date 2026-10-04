import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.vue'
import { routes } from '../router'
import { filesApi } from '../api/files'

beforeEach(() => { vi.spyOn(filesApi, 'list').mockResolvedValue({ list: [], totalCount: 0, pageNo: 1, pageSize: 20, pageTotal: 1 }) })

async function renderApp() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/drive')
  await router.isReady()
  const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })
  return { wrapper, router }
}

describe('导航与主题控件', () => {
  it('移动导航可展开、Escape 关闭并恢复打开按钮焦点', async () => {
    const { wrapper } = await renderApp()
    const opener = wrapper.get('button[aria-label="打开导航"]')
    await opener.trigger('click')
    expect(opener.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('关闭导航')
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(opener.element)
  })

  it('点击抽屉内不会关闭，点击遮罩会关闭', async () => {
    const { wrapper } = await renderApp()
    await wrapper.get('button[aria-label="打开导航"]').trigger('click')
    await wrapper.get('[role="dialog"]').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    await wrapper.get('[data-testid="drawer-backdrop"]').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('Tab 焦点保持在抽屉内，切换页面后关闭', async () => {
    const { wrapper, router } = await renderApp()
    await wrapper.get('button[aria-label="打开导航"]').trigger('click')
    const drawer = wrapper.get('[role="dialog"]')
    const focusables = drawer.element.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!
    first.focus()
    await drawer.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    await drawer.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    await drawer.get('a[href="/appearance"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/appearance')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.get('h1').text()).toContain('舒服的外观')
  })

  it('侧栏与设置页共享同一主题，并明确标示未开放上传功能', async () => {
    const { wrapper, router } = await renderApp()
    expect(wrapper.text()).toContain('上传与在线预览将在后续版本开放')
    expect(wrapper.get('.page-actions .primary-button').attributes('disabled')).toBeDefined()
    await wrapper.get('.desktop-sidebar button[title="深色"]').trigger('click')
    expect(document.documentElement.dataset.theme).toBe('dark')
    await router.push('/appearance')
    await flushPromises()
    expect(wrapper.findAll('.theme-card')[1]!.attributes('aria-pressed')).toBe('true')
    await wrapper.findAll('.theme-card')[0]!.trigger('click')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(wrapper.get('.desktop-sidebar button[title="浅色"]').attributes('aria-pressed')).toBe('true')
  })
})
