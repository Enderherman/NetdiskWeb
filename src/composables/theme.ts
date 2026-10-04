import { computed, onScopeDispose, readonly, ref, watch } from 'vue'

export type ThemePreference = 'light' | 'dark' | 'system'
export const THEME_STORAGE_KEY = 'netdisk.theme'

function parsePreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/** 由应用根组件创建一次，通过依赖注入供所有主题控件共享。 */
export function createTheme() {
  let saved: string | null = null
  try { saved = localStorage.getItem(THEME_STORAGE_KEY) } catch { /* 存储受限时仍可切换。 */ }
  const preference = ref<ThemePreference>(parsePreference(saved))
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const systemDark = ref(media.matches)
  const resolved = computed(() => preference.value === 'system'
    ? (systemDark.value ? 'dark' : 'light')
    : preference.value)

  watch(resolved, (value) => {
    document.documentElement.dataset.theme = value
    document.documentElement.style.colorScheme = value
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'dark' ? '#171717' : '#f9f9f9')
  }, { immediate: true, flush: 'sync' })

  function setPreference(value: ThemePreference) {
    preference.value = value
    try { localStorage.setItem(THEME_STORAGE_KEY, value) } catch { /* 仅保存失败，不中断界面。 */ }
  }
  function onSystemChange(event: MediaQueryListEvent) { systemDark.value = event.matches }
  function onStorage(event: StorageEvent) {
    if (event.key === THEME_STORAGE_KEY || event.key === null) preference.value = parsePreference(event.newValue)
  }
  media.addEventListener('change', onSystemChange)
  window.addEventListener('storage', onStorage)
  onScopeDispose(() => {
    media.removeEventListener('change', onSystemChange)
    window.removeEventListener('storage', onStorage)
  })
  return { preference: readonly(preference), resolved, setPreference }
}

export type Theme = ReturnType<typeof createTheme>
