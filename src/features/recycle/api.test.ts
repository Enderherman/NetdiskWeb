import { describe, expect, it, vi } from 'vitest'
import { recycleApi } from './api'
import { policy, result } from './__tests__/fixtures'

describe('回收站接口契约', () => {
  it('列表和策略使用真实GET接口与Cookie会话，不传用户ID', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => new Response(JSON.stringify({ code: 200, data: String(input).includes('/policy') ? policy : result() })))
    await recycleApi.list(2, 50)
    await recycleApi.policy()
    const url = new URL(String(fetchMock.mock.calls[0]![0]), 'http://localhost')
    expect(url.pathname).toBe('/api/recycle/loadRecycleList')
    expect(Object.fromEntries(url.searchParams)).toEqual({ pageNo: '2', pageSize: '50' })
    expect(fetchMock.mock.calls[0]![1]?.credentials).toBe('include')
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/recycle/policy')
  })
  it('恢复与删除只发当前选中ID，清空是独立POST且不包含选中项', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => new Response(JSON.stringify({ code: 200, data: String(input).endsWith('/clear') ? { deletedCount: 12 } : null })))
    await recycleApi.recover(['report', 'folder'])
    await recycleApi.remove(['report'])
    expect(await recycleApi.clear()).toEqual({ deletedCount: 12 })
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/recycle/recoverFile', '/api/recycle/delFile', '/api/recycle/clear'])
    expect(fetchMock.mock.calls.every(call => call[1]?.method === 'POST')).toBe(true)
    expect(Object.fromEntries((fetchMock.mock.calls[0]![1]!.body as URLSearchParams))).toEqual({ fileIds: 'report,folder' })
    expect(Object.fromEntries((fetchMock.mock.calls[1]![1]!.body as URLSearchParams))).toEqual({ fileIds: 'report' })
    expect(Object.fromEntries((fetchMock.mock.calls[2]![1]!.body as URLSearchParams))).toEqual({})
  })
  it('不完整策略不替换成默认30天，矛盾的0天自动清理也不接受', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    for (const data of [null, {}, { retentionDays: 30 }, { ...policy, retentionDays: -1 }, { ...policy, retentionDays: 0 }]) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data })))
      await expect(recycleApi.policy()).rejects.toThrow('无法显示保留期限')
    }
  })
  it('异常列表/清空结果与901不能伪装为空或成功', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: null })))
    await expect(recycleApi.list()).rejects.toThrow('列表响应异常')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: { deletedCount: -1 } })))
    await expect(recycleApi.clear()).rejects.toThrow('返回结果不完整')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 901, message: '登录已失效' })))
    await expect(recycleApi.recover(['report'])).rejects.toMatchObject({ code: 901 })
  })
})
