import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '../../api/client'
import type { SessionUser } from '../../types/account'
import RecycleView from './RecycleView.vue'
import { recycleApi } from './api'
import { folder, policy, report, result } from './__tests__/fixtures'
import type { RecyclePage } from './types'

const account = { user: ref<SessionUser | null>(null), refreshSpace: vi.fn() }
vi.mock('../../composables/account', async importOriginal => ({
  ...await importOriginal<typeof import('../../composables/account')>(), useAccount: () => account,
}))
beforeEach(() => {
  account.user.value = { userId: 'member', nickName: '测试用户', isAdmin: false, avatar: null }
  account.refreshSpace.mockReset().mockResolvedValue(undefined)
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-05T00:00:00Z'))
  vi.spyOn(recycleApi, 'list').mockResolvedValue(result())
  vi.spyOn(recycleApi, 'policy').mockResolvedValue(policy)
})
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/recycle', component: RecycleView }, { path: '/drive', component: { template: '<div />' } },
    { path: '/auth/login', component: { template: '<div />' } },
  ] })
  await router.push('/recycle')
  mount(RecycleView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return new DOMWrapper(document.body)
}
async function selectReport(body: DOMWrapper<Element>) { await body.get('[aria-label="选择 旧报告.pdf"]').setValue(true) }
function action(body: DOMWrapper<Element>, label: string) { return body.findAll('.selection-toolbar button').find(button => button.text().includes(label))! }

describe('回收站界面', () => {
  it('显示真实策略、回收时间和截止日，缺时间的条目不编造期限', async () => {
    const body = await render()
    expect(body.get('[aria-label="回收站保留策略"]').text()).toContain('保留 7 天')
    const cards = body.findAll('.recycle-card-shell')
    expect(cards[0]!.text()).toContain('回收时间：2026-10-01 09:30')
    expect(cards[0]!.text()).toContain('保留至 2026-10-08 09:30')
    expect(cards[1]!.text()).toContain('未提供回收时间')
    expect(cards[1]!.text()).not.toContain('保留至')
    await body.get('[aria-label="旧报告.pdf 的详情和操作"]').trigger('click')
    expect(body.get('.file-details').text()).toContain('2026-09-28 11:00')
    expect(body.get('.file-details').text()).toContain('2026-10-01 09:30')
  })
  it('策略读取失败不默认30天；关闭自动清理后不显示到期日期', async () => {
    vi.mocked(recycleApi.policy).mockRejectedValueOnce(new ApiError('策略读取失败', 0)).mockResolvedValueOnce({ ...policy, retentionDays: 14, autoCleanupEnabled: false })
    const body = await render()
    expect(body.get('[aria-label="回收站保留策略"]').text()).toContain('暂时无法显示保留期限')
    expect(body.text()).not.toContain('30 天')
    expect(body.findAll('.recycle-entry-time').every(item => !item.text().includes('保留至'))).toBe(true)
    await body.get('.recycle-policy button').trigger('click'); await flushPromises()
    expect(body.get('.recycle-policy').text()).toContain('14 天')
    expect(body.get('.recycle-policy').text()).toContain('自动清理已关闭')
    expect(body.get('.recycle-entry-time').text()).toContain('当前未开启到期自动清理')
  })
  it('当前页全选与分页互相隔离，下一页不会沿用旧选择', async () => {
    vi.mocked(recycleApi.list).mockResolvedValueOnce({ ...result(), totalCount: 21, pageTotal: 2 })
      .mockResolvedValueOnce({ ...result([{ ...report, fileId: 'page2', fileName: '第二页.pdf' }]), pageNo: 2, totalCount: 21, pageTotal: 2 })
    const body = await render()
    await body.get('[aria-label="选择当前页全部回收项"]').setValue(true)
    expect(body.get('.selection-toolbar').text()).toContain('当前页 2 项')
    await body.get('[aria-label="下一页回收站"]').trigger('click'); await flushPromises()
    expect(recycleApi.list).toHaveBeenLastCalledWith(2, 20, expect.any(AbortSignal))
    expect(body.find('.selection-toolbar').exists()).toBe(false)
    expect((body.get('[aria-label="选择 第二页.pdf"]').element as HTMLInputElement).checked).toBe(false)
  })
  it('恢复明确原目录优先规则，仅服务成功后刷新列表和真实容量', async () => {
    const recover = vi.spyOn(recycleApi, 'recover').mockResolvedValue(null)
    const body = await render()
    await selectReport(body); await action(body, '恢复所选').trigger('click')
    expect(body.get('[role="dialog"]').text()).toContain('优先恢复原目录')
    expect(body.get('[role="dialog"]').text()).toContain('全部文件')
    expect(recover).not.toHaveBeenCalled()
    vi.mocked(recycleApi.list).mockResolvedValue(result([folder]))
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(recover).toHaveBeenCalledWith(['report'])
    expect(account.refreshSpace).toHaveBeenCalledTimes(1)
    expect(body.get('[role="status"]').text()).toContain('已恢复 1 个选中条目')
    expect(body.find('[aria-label="选择 旧报告.pdf"]').exists()).toBe(false)
  })
  it('恢复失败保留选中项和对话框，重试不会伪造成功', async () => {
    const recover = vi.spyOn(recycleApi, 'recover').mockRejectedValueOnce(new ApiError('原数据暂不可用', 600)).mockResolvedValueOnce(null)
    const body = await render()
    await selectReport(body); await action(body, '恢复所选').trigger('click')
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(body.get('[role="alert"]').text()).toBe('原数据暂不可用')
    expect((body.get('[aria-label="选择 旧报告.pdf"]').element as HTMLInputElement).checked).toBe(true)
    expect(account.refreshSpace).not.toHaveBeenCalled()
    expect(body.find('.form-notice.success').exists()).toBe(false)
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(recover).toHaveBeenCalledTimes(2)
    expect(body.find('[role="dialog"]').exists()).toBe(false)
  })
  it('永久删除需再次确认不可恢复，取消不会调用接口', async () => {
    const remove = vi.spyOn(recycleApi, 'remove').mockResolvedValue(null)
    const body = await render()
    await selectReport(body); await action(body, '永久删除').trigger('click')
    expect(body.get('[role="dialog"]').text()).toContain('删除后无法从回收站恢复')
    expect(body.get('.modal-footer .primary-button').attributes('disabled')).toBeDefined()
    await body.get('.modal-footer .secondary-button').trigger('click')
    expect(remove).not.toHaveBeenCalled()
    await action(body, '永久删除').trigger('click')
    await body.get('.recycle-confirm input').setValue(true)
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(remove).toHaveBeenCalledWith(['report'])
    expect(body.get('[role="status"]').text()).toContain('已永久删除所选内容')
  })
  it('清空明确所有页面范围，不把当前选择当作清空范围', async () => {
    vi.mocked(recycleApi.list).mockResolvedValue({ ...result(), totalCount: 42, pageTotal: 3 })
    const clear = vi.spyOn(recycleApi, 'clear').mockResolvedValue({ deletedCount: 107 })
    const body = await render()
    await selectReport(body)
    await body.findAll('.page-actions button')[1]!.trigger('click')
    expect(body.get('.recycle-scope').text()).toContain('所有页面')
    expect(body.get('.recycle-scope').text()).toContain('42')
    expect(body.get('[role="dialog"]').text()).toContain('与当前页选择无关')
    expect(clear).not.toHaveBeenCalled()
    await body.get('.recycle-confirm input').setValue(true)
    vi.mocked(recycleApi.list).mockResolvedValue(result([]))
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(clear).toHaveBeenCalledWith()
    expect(body.get('[role="status"]').text()).toContain('107 项内容')
    expect(body.text()).toContain('回收站是空的')
    expect(account.refreshSpace).toHaveBeenCalledTimes(1)
  })
  it('清空返回0表示已为空，不编造删除数量', async () => {
    vi.spyOn(recycleApi, 'clear').mockResolvedValue({ deletedCount: 0 })
    const body = await render()
    await body.findAll('.page-actions button')[1]!.trigger('click')
    await body.get('.recycle-confirm input').setValue(true)
    vi.mocked(recycleApi.list).mockResolvedValue(result([]))
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(body.get('[role="status"]').text()).toBe('回收站已为空')
  })
  it('901删除失败保留确认和选择，不刷新为空或显示成功', async () => {
    vi.spyOn(recycleApi, 'remove').mockRejectedValue(new ApiError('登录已失效，请重新登录', 901))
    const body = await render()
    await selectReport(body); await action(body, '永久删除').trigger('click')
    await body.get('.recycle-confirm input').setValue(true)
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(body.get('[role="alert"]').text()).toContain('登录已失效')
    expect(body.find('[role="dialog"]').exists()).toBe(true)
    expect((body.get('[aria-label="选择 旧报告.pdf"]').element as HTMLInputElement).checked).toBe(true)
    expect(recycleApi.list).toHaveBeenCalledTimes(1)
    expect(account.refreshSpace).not.toHaveBeenCalled()
    expect(body.find('.form-notice.success').exists()).toBe(false)
  })
  it('写入期间阻止重复点击、关闭和分页', async () => {
    let finish!: (value: null) => void
    const recover = vi.spyOn(recycleApi, 'recover').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const body = await render()
    await selectReport(body); await action(body, '恢复所选').trigger('click')
    await body.get('.modal-footer .primary-button').trigger('click')
    await body.get('.modal-footer .primary-button').trigger('click')
    await body.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(recover).toHaveBeenCalledTimes(1)
    expect(body.get('[aria-label="关闭对话框"]').attributes('disabled')).toBeDefined()
    expect(body.get('#recycle-page-size').attributes('disabled')).toBeDefined()
    finish(null); await flushPromises()
  })
  it('加载失败显示错误而非空回收站，重试可恢复', async () => {
    vi.mocked(recycleApi.list).mockRejectedValueOnce(new ApiError('网络中断', 0)).mockResolvedValueOnce(result())
    const body = await render()
    expect(body.get('.recycle-state [role="alert"]').text()).toBe('网络中断')
    expect(body.text()).not.toContain('回收站是空的')
    await body.get('.recycle-state .secondary-button').trigger('click'); await flushPromises()
    expect(body.findAll('.recycle-card-shell')).toHaveLength(2)
    await body.get('#recycle-page-size').setValue('50'); await flushPromises()
    expect(recycleApi.list).toHaveBeenLastCalledWith(1, 50, expect.any(AbortSignal))
  })
  it('当前页为空但其他页仍有内容时，不宣称整个回收站为空', async () => {
    vi.mocked(recycleApi.list).mockResolvedValueOnce({ ...result([]), totalCount: 21, pageNo: 2, pageTotal: 2 })
    const body = await render()
    expect(body.text()).toContain('这一页暂时没有回收项')
    expect(body.text()).not.toContain('回收站是空的')
    await body.get('.recycle-state .secondary-button').trigger('click'); await flushPromises()
    expect(recycleApi.list).toHaveBeenLastCalledWith(1, 20, expect.any(AbortSignal))
  })
  it('账号变化清除旧选择，旧请求迟到不能展示前一个账号内容', async () => {
    let finishOld!: (value: RecyclePage) => void
    vi.mocked(recycleApi.list).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    const body = await render()
    vi.mocked(recycleApi.list).mockResolvedValue(result([{ ...folder, fileId: 'new', fileName: '新账号的资料' }]))
    account.user.value = { userId: 'another', nickName: '新用户', avatar: null, isAdmin: false }
    await flushPromises()
    finishOld(result()); await flushPromises()
    expect(body.text()).toContain('新账号的资料')
    expect(body.text()).not.toContain('旧报告.pdf')
    expect(body.find('.selection-toolbar').exists()).toBe(false)
  })
})
