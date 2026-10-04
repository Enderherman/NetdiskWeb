import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import AdminFilesView from './AdminFilesView.vue'
import { adminApi } from './api'
import * as previewContent from '../../preview/previewContent'
import { button, fileRecord, page, renderAdmin, userRecord } from './__tests__/fixtures'

beforeEach(() => { vi.spyOn(adminApi, 'users').mockResolvedValue(page([userRecord])); vi.spyOn(adminApi, 'files').mockResolvedValue(page([fileRecord])) })
describe('管理员文件页面', () => {
  it('先确认所属用户，不自动查询全站文件，普通用户无管理请求', async () => {
    const { body } = await renderAdmin(AdminFilesView, '/admin/files')
    expect(body.text()).toContain('先选择所属用户'); expect(adminApi.files).not.toHaveBeenCalled()
    await body.get('#admin-file-owner').setValue('alice'); await body.get('form').trigger('submit'); await flushPromises()
    expect(adminApi.users).toHaveBeenLastCalledWith({ userId: 'alice', pageNo: 1, pageSize: 20 }, expect.any(AbortSignal))
    expect(adminApi.files).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 'alice', filePid: '0', delFlag: 2 }), expect.any(AbortSignal))
    expect(body.text()).toContain('真实用户 的网盘'); expect(body.text()).toContain('报告.pdf')
  })
  it('角色守卫阻止从URL直接进入管理数据', async () => {
    const { body } = await renderAdmin(AdminFilesView, '/admin/files', false, '?userId=alice')
    expect(body.text()).toContain('需要管理员权限'); expect(adminApi.users).not.toHaveBeenCalled(); expect(adminApi.files).not.toHaveBeenCalled()
  })
  it('原始内容和下载链接使用准确所有者，下载失败不会显示已准备', async () => {
    const preview = vi.spyOn(previewContent, 'loadPreview').mockResolvedValue({ mode: 'text', url: '/api/admin/content/alice/report', mime: 'text/plain', text: '管理预览' })
    const code = vi.spyOn(adminApi, 'downloadCode').mockRejectedValueOnce(new ApiError('文件已不可用', 600)).mockResolvedValueOnce('A'.repeat(50))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { body } = await renderAdmin(AdminFilesView, '/admin/files', true, '?userId=alice')
    await body.get('.file-name-button').trigger('click')
    await button(body, '下载原件').trigger('click'); await flushPromises()
    expect(body.text()).toContain('文件已不可用'); expect(click).not.toHaveBeenCalled()
    await button(body, '下载原件').trigger('click'); await flushPromises()
    expect(code).toHaveBeenLastCalledWith('alice', 'report'); expect(click).toHaveBeenCalledTimes(1)
    expect(body.text()).toContain('下载链接已准备')
    await button(body, '在线预览').trigger('click'); await flushPromises()
    expect(preview).toHaveBeenCalledWith(fileRecord, '/api/admin/content/alice/report', expect.any(AbortSignal))
    expect(body.get('.text-preview').text()).toBe('管理预览')
  })
  it('缩略图使用所属用户授权路径，回收项不请求内容', async () => {
    vi.mocked(adminApi.files).mockResolvedValue(page([{ ...fileRecord, fileCover: 'cover.jpg' }, { ...fileRecord, fileId: 'recycled', fileCover: 'cover.jpg', delFlag: 1 }]))
    const { body } = await renderAdmin(AdminFilesView, '/admin/files', true, '?userId=alice')
    expect(body.findAll('.file-symbol img')).toHaveLength(1)
    expect(body.get('.file-symbol img').attributes('src')).toBe('/api/admin/thumbnail/alice/report')
  })
  it('永久删除需明确确认，失败保留原列表与确认框，成功刷新', async () => {
    const remove = vi.spyOn(adminApi, 'deleteFiles').mockRejectedValueOnce(new ApiError('删除未完成', 500)).mockResolvedValueOnce(null)
    const { body } = await renderAdmin(AdminFilesView, '/admin/files', true, '?userId=alice')
    await body.get('[aria-label="选择 报告.pdf"]').setValue(true)
    await button(body, '永久删除所选').trigger('click')
    expect(remove).not.toHaveBeenCalled(); expect(body.get('[role="dialog"]').text()).toContain('无法再从回收站恢复')
    expect(body.get('[role="dialog"]').text()).toContain('alice')
    await button(body, '确认永久删除').trigger('click'); await flushPromises()
    expect(body.text()).toContain('删除未完成'); expect(body.find('.form-notice.success').exists()).toBe(false)
    vi.mocked(adminApi.files).mockResolvedValue(page([]))
    await button(body, '确认永久删除').trigger('click'); await flushPromises()
    expect(remove).toHaveBeenLastCalledWith([fileRecord]); expect(body.find('[role="dialog"]').exists()).toBe(false)
    expect(body.text()).toContain('所选项目已永久删除')
  })
  it('目录和分页始终保留所有者，读取错误不虚构文件', async () => {
    const folder = { ...fileRecord, fileId: 'folder', fileName: '资料', folderType: 1 as const, fileSize: null }
    vi.mocked(adminApi.files).mockResolvedValueOnce(page([folder])).mockResolvedValueOnce({ ...page([fileRecord]), totalCount: 21, pageTotal: 2 })
      .mockRejectedValueOnce(new ApiError('文件读取失败', 500))
    const { body } = await renderAdmin(AdminFilesView, '/admin/files', true, '?userId=alice')
    await body.get('.file-name-button').trigger('click'); await flushPromises()
    expect(adminApi.files).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 'alice', filePid: 'folder', pageNo: 1 }), expect.any(AbortSignal))
    await body.get('[aria-label="下一页管理文件"]').trigger('click'); await flushPromises()
    expect(adminApi.files).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 'alice', filePid: 'folder', pageNo: 2 }), expect.any(AbortSignal))
    expect(body.find('.file-table').exists()).toBe(false); expect(body.text()).toContain('文件读取失败')
  })
})
