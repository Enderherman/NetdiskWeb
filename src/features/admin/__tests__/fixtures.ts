import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Component } from 'vue'
import { accountApi } from '../../../api/account'
import { useAccount } from '../../../composables/account'
import type { AdminFile, AdminUser, Page, SystemSettings } from '../types'

export const adminSession = { userId: 'operator', nickName: '管理者', isAdmin: true, avatar: null }
export const userRecord: AdminUser = { userId: 'alice', nickName: '真实用户', email: 'alice@example.test', status: 1,
  useSpace: 20 * 1024 ** 2, totalSpace: 100 * 1024 ** 2, createTime: '2026-10-01 10:00:00', lastLoginTime: '2026-10-05 10:00:00' }
export const fileRecord: AdminFile = { fileId: 'report', userId: 'alice', filePid: '0', fileName: '报告.pdf', fileSize: 1024,
  folderType: 0, fileCategory: 4, fileType: 4, status: 2, delFlag: 2, nickName: '真实用户', recoveryTime: null, lastUpdateTime: '2026-10-05 10:00:00' }
export const systemSettings: SystemSettings = { registerEmailTitle: '真实邮件标题', registerEmailContent: '验证码为 %s，请妥善保管。', userInitUseSpace: 2048 }
export function page<T>(list: T[]): Page<T> { return { list, totalCount: list.length, pageNo: 1, pageSize: 20, pageTotal: 1 } }
export function button(body: DOMWrapper<Element>, text: string) { return body.findAll('button').find(item => item.text() === text)! }
export async function renderAdmin(component: Component, path: string, administrator = true, query = '') {
  useAccount().clearSession()
  vi.spyOn(accountApi, 'current').mockResolvedValue({ ...adminSession, isAdmin: administrator })
  vi.spyOn(accountApi, 'space').mockResolvedValue({ useSpace: 0, totalSpace: 100 })
  await useAccount().ensureSession(true)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    ...['/admin/users', '/admin/files', '/admin/system'].map(routePath => ({ path: routePath, component: routePath === path ? component : { template: '<p>管理页面</p>' } })),
    { path: '/drive', component: { template: '<p>我的文件</p>' } },
    { path: '/auth/login', component: { template: '<p>登录</p>' } },
  ] })
  await router.push(path + query)
  mount({ template: '<RouterView />' }, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return { body: new DOMWrapper(document.body), router }
}
