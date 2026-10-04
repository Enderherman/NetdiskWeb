import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import DriveView from '../../views/DriveView.vue'
import { filesApi } from '../../api/files'
import { accountApi } from '../../api/account'
import { useAccount } from '../../composables/account'
import { operationsApi } from './api'
import type { FileItem } from '../../types/files'

describe('文件页批量操作接线', () => {
  it('复制提交期间列表刷新不销毁正在执行的对话框，完成后显示实际新条目数', async () => {
    const file: FileItem = { fileId: 'fileA', filePid: '0', fileName: '说明.txt', fileSize: 20, folderType: 0, fileType: 7, fileCategory: 4, status: 2, lastUpdateTime: '2026-10-05 02:00:00' }
    vi.spyOn(accountApi, 'current').mockResolvedValue({ userId: 'owner', nickName: '测试', avatar: null, isAdmin: false })
    vi.spyOn(accountApi, 'space').mockResolvedValue({ useSpace: 20, totalSpace: 1024 })
    await useAccount().ensureSession(true)
    vi.spyOn(filesApi, 'list').mockResolvedValue({ list: [file], totalCount: 1, pageNo: 1, pageSize: 20, pageTotal: 1 })
    vi.spyOn(filesApi, 'folders').mockResolvedValue([])
    let finish!: (files: FileItem[]) => void
    const copy = vi.spyOn(operationsApi, 'copy').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/drive', component: DriveView }] })
    await router.push('/drive')
    mount(DriveView, { attachTo: document.body, global: { plugins: [router] } }); await flushPromises()
    const body = new DOMWrapper(document.body)
    await body.get('[aria-label="选择 说明.txt"]').setValue(true)
    await body.findAll('.file-operations button').find(button => button.text() === '复制到…')!.trigger('click'); await flushPromises()
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    window.dispatchEvent(new Event('netdisk:files-changed')); await flushPromises()
    expect(body.get('[role="dialog"]').text()).toContain('说明.txt')
    expect(copy).toHaveBeenCalledTimes(1)
    finish([{ ...file, fileId: 'fileB', fileName: '说明 (1).txt' }]); await flushPromises()
    expect(body.find('[role="dialog"]').exists()).toBe(false)
    expect(body.get('.drive-notice').text()).toContain('已复制 1 项到“全部文件”')
  })
})
