<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'
import SidebarContent from './SidebarContent.vue'
import AccountBadge from './AccountBadge.vue'

const route = useRoute()
const menuOpen = ref(false)
const menuButton = ref<HTMLButtonElement>()
const drawer = ref<HTMLElement>()
let previousOverflow = ''

function closeMenu() { menuOpen.value = false }
function trapFocus(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); closeMenu(); return }
  if (event.key !== 'Tab') return
  const items = drawer.value?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]')
  if (!items?.length) return
  const first = items[0]!
  const last = items[items.length - 1]!
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

watch(menuOpen, async (open) => {
  if (open) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    await nextTick()
    drawer.value?.querySelector<HTMLButtonElement>('button')?.focus()
  } else {
    document.body.style.overflow = previousOverflow
    await nextTick()
    menuButton.value?.focus()
  }
})
watch(() => route.fullPath, closeMenu)
onBeforeUnmount(() => { if (menuOpen.value) document.body.style.overflow = previousOverflow })
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">跳至主要内容</a>
    <aside class="desktop-sidebar" aria-label="侧边栏"><SidebarContent /></aside>
    <div class="workspace" :inert="menuOpen || undefined">
      <header class="topbar">
        <button ref="menuButton" class="icon-button mobile-menu" aria-label="打开导航" aria-controls="mobile-navigation" :aria-expanded="menuOpen" @click="menuOpen = true"><AppIcon name="menu" /></button>
        <div class="breadcrumb"><span>个人空间</span><AppIcon name="chevron" :size="12" /><strong>{{ route.meta.title }}</strong></div>
        <div class="topbar-right"><AccountBadge /></div>
      </header>
      <main id="main-content" tabindex="-1"><slot /></main>
      <footer class="workspace-footer"><span>属于你的空间，自在有序。</span><span>Netdisk</span></footer>
    </div>
    <div v-if="menuOpen" class="drawer-backdrop" data-testid="drawer-backdrop" @click.self="closeMenu">
      <aside id="mobile-navigation" ref="drawer" class="mobile-drawer" role="dialog" aria-modal="true" aria-label="导航菜单" @keydown="trapFocus">
        <button class="icon-button drawer-close" aria-label="关闭导航" @click="closeMenu"><AppIcon name="close" /></button>
        <SidebarContent @navigate="closeMenu" />
      </aside>
    </div>
  </div>
</template>
