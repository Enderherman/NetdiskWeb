import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import AccountBadge from './AccountBadge.vue'
import { useAccount } from '../composables/account'
import { accountApi } from '../api/account'

describe('账户头像', () => {
  it('只使用本站头像接口，失败显示昵称，刷新资料后重试', async () => {
    const user = { userId: 'testA', nickName: '测试', isAdmin: false, avatar: 'https://untrusted.example/avatar' }
    vi.spyOn(accountApi, 'space').mockResolvedValue({ useSpace: 0, totalSpace: 1024 })
    vi.spyOn(accountApi, 'current').mockImplementation(async () => ({ ...user }))
    await useAccount().ensureSession(true)
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }, { path: '/settings', component: {} }] })
    await router.push('/')
    const wrapper = mount(AccountBadge, { global: { plugins: [router] } })
    const firstUrl = wrapper.get('img').attributes('src')
    expect(firstUrl).toBe('/api/getAvatar/testA?v=0')
    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('.user-avatar').text()).toBe('测')
    await useAccount().ensureSession(true); await flushPromises()
    expect(wrapper.get('img').attributes('src')).not.toBe(firstUrl)
    await wrapper.get('.user-avatar').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/settings')
    useAccount().clearSession()
  })
})
