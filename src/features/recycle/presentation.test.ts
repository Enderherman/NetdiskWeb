import { describe, expect, it } from 'vitest'
import { policySummary, recoveryLabel, recoveryTimestamp, retentionInfo } from './presentation'
import { policy } from './__tests__/fixtures'

describe('回收站日期与期限', () => {
  it('按JsonFormat的GMT+8解析而非浏览器本地时区', () => {
    expect(recoveryTimestamp('2026-10-05 08:00:00')).toBe(Date.parse('2026-10-05T00:00:00Z'))
    expect(recoveryLabel('2026-10-05 08:00:00')).toBe('2026-10-05 08:00')
  })
  it('空值、异常格式和不存在的日期不会生成回收时间', () => {
    for (const value of [null, undefined, '', 'not-time', '2026-02-30 10:00:00', '2026-13-01 00:00:00', '2026-10-01 25:00:00']) {
      expect(recoveryTimestamp(value)).toBeNull()
      expect(retentionInfo(value, policy).text).toContain('缺少有效回收时间')
    }
    expect(recoveryLabel(null)).toBe('未提供回收时间')
  })
  it('保留期限按完整天数计算，等于截止时刻只标记等待清理', () => {
    const expiry = Date.parse('2026-10-08T01:30:00Z')
    expect(retentionInfo('2026-10-01 09:30:00', policy, expiry - 1)).toEqual({ text: '保留至 2026-10-08 09:30', overdue: false })
    expect(retentionInfo('2026-10-01 09:30:00', policy, expiry)).toEqual({ text: '已达到保留期限，等待服务器清理', overdue: true })
  })
  it('自动清理关闭时不显示到期日，也不宣称永久保留', () => {
    const disabled = { ...policy, retentionDays: 14, autoCleanupEnabled: false }
    expect(policySummary(disabled)).toContain('14 天')
    expect(policySummary(disabled)).toContain('自动清理已关闭')
    expect(retentionInfo('2000-01-01 00:00:00', disabled)).toEqual({ text: '当前未开启到期自动清理', overdue: false })
    expect(policySummary({ ...disabled, retentionDays: 0 })).not.toContain('永久')
  })
  it('策略未知和超出可显示范围的日期保持未知状态', () => {
    expect(retentionInfo('2026-10-01 00:00:00', null).text).toBe('保留期限暂不可用')
    expect(retentionInfo('2026-10-01 00:00:00', { ...policy, retentionDays: 2147483647 }).text).toContain('超出可显示范围')
  })
})
