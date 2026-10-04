import type { RecyclePolicy } from './types'

const DAY = 24 * 60 * 60 * 1000
const BEIJING_OFFSET = 8 * 60 * 60 * 1000

/** recoveryTime 的 JsonFormat 为 yyyy-MM-dd HH:mm:ss / GMT+8。拒绝猜测其他日期格式。 */
export function recoveryTimestamp(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year!, month! - 1, day!); date.setUTCHours(hour!, minute!, second!, 0)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day
    || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) return null
  return date.getTime() - BEIJING_OFFSET
}

export function beijingDate(timestamp: number): string {
  const date = new Date(timestamp + BEIJING_OFFSET)
  if (!Number.isFinite(date.getTime())) return '时间超出可显示范围'
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

export function recoveryLabel(value: string | null | undefined): string {
  const time = recoveryTimestamp(value)
  return time === null ? (value ? '回收时间格式异常' : '未提供回收时间') : beijingDate(time)
}

export function retentionInfo(value: string | null | undefined, policy: RecyclePolicy | null, now = Date.now()): { text: string; overdue: boolean } {
  if (!policy) return { text: '保留期限暂不可用', overdue: false }
  if (!policy.autoCleanupEnabled) return { text: '当前未开启到期自动清理', overdue: false }
  const start = recoveryTimestamp(value)
  if (start === null) return { text: '缺少有效回收时间，无法计算到期日', overdue: false }
  const deadline = start + policy.retentionDays * DAY
  if (!Number.isSafeInteger(deadline) || !Number.isFinite(new Date(deadline).getTime())) {
    return { text: '保留期限超出可显示范围', overdue: false }
  }
  return deadline <= now
    ? { text: '已达到保留期限，等待服务器清理', overdue: true }
    : { text: `保留至 ${beijingDate(deadline)}`, overdue: false }
}

export function policySummary(policy: RecyclePolicy): string {
  if (!policy.autoCleanupEnabled) return policy.retentionDays > 0
    ? `配置保留期限为 ${policy.retentionDays} 天，当前自动清理已关闭。`
    : '当前未开启到期自动清理。'
  return `回收内容保留 ${policy.retentionDays} 天，达到期限后由服务器自动清理。`
}
