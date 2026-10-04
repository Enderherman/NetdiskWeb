import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import DriveView from '../../views/DriveView.vue'
import { filesApi } from '../../api/files'
import { sharesApi } from './api'
import type { FileItem } from '../../types/files'

describe('文件页分享接线', () => {
  it('详情切换到单层分享对话框，创建成功保留链接供复制', async () => {
    const file: FileItem = { fileId: 'fileA', filePid: '0', fileName: '说明.txt', folderType: 0, fileCategory: 4, fileType: 7, fileSize: 100, status: 2, lastUpdateTime: '2026-10-05 01:00:00' }
    vi.spyOn(filesApi, 'list').mockResolvedValue({ list: [file], totalCount: 1, pageNo: 1, pageSize: 20, pageTotal: 1 })
    vi.spyOn(sharesApi, 'create').mockResolvedValue({ shareId: 'shareA', fileId: 'fileA', userId: 'demo', fileName: '说明.txt', folderType: 0, fileCategory: 4, fileType: 7, validType: 1, shareTime: '2026-10-05 01:00:00', expireTime: '2026-10-12 01:00:00', code: 'AB12', showCount: 0 })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/drive', component: DriveView }] })
    await router.push('/drive')
    mount(DriveView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    const body = new DOMWrapper(document.body)
    await body.get('[aria-label="说明.txt 的详情和操作"]').trigger('click')
    await body.findAll('.detail-actions button').find(button => button.text() === '分享')!.trigger('click')
    await flushPromises()
    expect(body.findAll('[role="dialog"]')).toHaveLength(1)
    await body.get('#share-create-form').trigger('submit')
    await flushPromises()
    expect(sharesApi.create).toHaveBeenCalledWith('fileA', 1, '')
    expect(body.get('[role="dialog"]').text()).toContain('分享已创建')
    expect((body.get('textarea').element as HTMLTextAreaElement).value).toContain('/s/shareA')
    expect(body.findAll('[role="dialog"]')).toHaveLength(1)
  })
})
