import { effectScope } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createTheme, THEME_STORAGE_KEY } from './theme'

function setupTheme(systemDark = false) {
  const changeListeners = new Set<(event: MediaQueryListEvent) => void>()
  vi.mocked(window.matchMedia).mockImplementation((query) => ({
    matches: systemDark, media: query, onchange: null,
    addEventListener: vi.fn((_name, listener) => changeListeners.add(listener as (event: MediaQueryListEvent) => void)),
    removeEventListener: vi.fn((_name, listener) => changeListeners.delete(listener as (event: MediaQueryListEvent) => void)),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
  const scope = effectScope()
  const theme = scope.run(createTheme)!
  return { theme, scope, changeListeners, setSystemDark: (matches: boolean) => changeListeners.forEach(listener => listener({ matches } as MediaQueryListEvent)) }
}

describe('配色偏好', () => {
  it('首次访问使用系统主题并实时响应系统变化', () => {
    const { theme, scope, setSystemDark } = setupTheme(true)
    expect(theme.preference.value).toBe('system')
    expect(document.documentElement.dataset.theme).toBe('dark')
    setSystemDark(false)
    expect(theme.resolved.value).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    scope.stop()
  })

  it('保存用户选择，重新打开后恢复，显式选择不被系统覆盖', () => {
    const first = setupTheme(false)
    first.theme.setPreference('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    first.setSystemDark(false)
    expect(first.theme.resolved.value).toBe('dark')
    first.scope.stop()
    const second = setupTheme(false)
    expect(second.theme.preference.value).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    second.scope.stop()
  })

  it('切回跟随系统立即生效', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    const { theme, scope } = setupTheme(true)
    expect(theme.resolved.value).toBe('light')
    theme.setPreference('system')
    expect(theme.resolved.value).toBe('dark')
    scope.stop()
  })

  it('存储被禁用或值损坏时仍能正常使用', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'invalid')
    const first = setupTheme(true)
    expect(first.theme.preference.value).toBe('system')
    first.scope.stop()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const second = setupTheme(false)
    expect(() => second.theme.setPreference('dark')).not.toThrow()
    expect(second.theme.resolved.value).toBe('dark')
    second.scope.stop()
  })

  it('同步其他标签页选择，销毁后解除系统监听', () => {
    const { theme, scope, changeListeners } = setupTheme(false)
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }))
    expect(theme.resolved.value).toBe('dark')
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: null }))
    expect(theme.preference.value).toBe('system')
    scope.stop()
    expect(changeListeners.size).toBe(0)
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }))
    expect(theme.preference.value).toBe('system')
  })
})
