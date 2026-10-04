import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import ShareCreateDialog from './ShareCreateDialog.vue'
import { sharesApi } from './api'
import { report, shareRecord } from './__tests__/fixtures'
import type { ShareRecord } from './types'

afterEach(() => { Reflect.deleteProperty(navigator, 'clipboard') })
async function render() {
  const component = mount(ShareCreateDialog, { props: { file: report }, attachTo: document.body })
  await flushPromises()
  return { component, body: new DOMWrapper(document.body) }
}

describe('创建分享对话框', () => {
  it('校验自定义提取码，服务确认后才展示真实链接并发送created事件', async () => {
    const create = vi.spyOn(sharesApi, 'create').mockResolvedValue({ ...shareRecord, code: 'Ab12', validType: 2 })
    const { component, body } = await render()
    await body.get('input[type="checkbox"]').setValue(true)
    await body.get('#share-custom-code').setValue('a')
    await body.get('#share-create-form').trigger('submit')
    expect(create).not.toHaveBeenCalled()
    expect(body.get('[role="alert"]').text()).toContain('4–5')
    await body.get('#share-custom-code').setValue('Ab12')
    await body.get('#share-validity').setValue('2')
    await body.get('#share-create-form').trigger('submit'); await flushPromises()
    expect(create).toHaveBeenCalledWith('report', 2, 'Ab12')
    expect(component.emitted('created')).toHaveLength(1)
    const text = (body.get('textarea').element as HTMLTextAreaElement).value
    expect(text).toContain('/s/share1'); expect(text).toContain('Ab12')
    expect(document.activeElement).toBe(body.get('textarea').element)
  })
  it('失败保留表单并可重试，未确认前不显示成功信息', async () => {
    vi.spyOn(sharesApi, 'create').mockRejectedValueOnce(new ApiError('文件已删除', 600)).mockResolvedValueOnce(shareRecord)
    const { body } = await render()
    await body.get('#share-create-form').trigger('submit'); await flushPromises()
    expect(body.get('[role="alert"]').text()).toBe('文件已删除')
    expect(body.find('textarea').exists()).toBe(false)
    await body.get('#share-create-form').trigger('submit'); await flushPromises()
    expect(body.get('.share-result-heading').text()).toContain('链接已就绪')
  })
  it('创建进行中阻止重复提交和关闭', async () => {
    let finish!: (result: ShareRecord) => void
    const create = vi.spyOn(sharesApi, 'create').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { component, body } = await render()
    await body.get('#share-create-form').trigger('submit')
    await body.get('#share-create-form').trigger('submit')
    await body.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(create).toHaveBeenCalledTimes(1)
    expect(component.emitted('close')).toBeUndefined()
    expect(body.get('[aria-label="关闭对话框"]').attributes('disabled')).toBeDefined()
    finish(shareRecord); await flushPromises()
  })
  it('剪贴板拒绝时提供手动复制，不显示虚假复制成功', async () => {
    vi.spyOn(sharesApi, 'create').mockResolvedValue(shareRecord)
    const writeText = vi.fn().mockRejectedValueOnce(new Error('permission')).mockResolvedValueOnce(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { body } = await render()
    await body.get('#share-create-form').trigger('submit'); await flushPromises()
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(body.get('[role="alert"]').text()).toContain('复制未完成')
    expect(body.find('[role="status"]').exists()).toBe(false)
    expect(body.find('textarea[readonly]').exists()).toBe(true)
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(body.get('[role="status"]').text()).toContain('已复制')
  })
})
