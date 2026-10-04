<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
const props = defineProps<{ title: string; busy?: boolean; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement>()
let previousFocus: HTMLElement | null = null
let previousOverflow = ''
let previousInert = false
function close() { if (!props.busy) emit('close') }
function trap(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); close(); return }
  if (event.key !== 'Tab') return
  const items = panel.value?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]')
  if (!items?.length) return
  const first = items[0]!, last = items[items.length - 1]!
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
onMounted(async () => {
  previousFocus = document.activeElement as HTMLElement | null
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  const app = document.getElementById('app')
  previousInert = app?.inert || false
  if (app) app.inert = true
  await nextTick()
  ;((panel.value?.querySelector('input') || panel.value?.querySelector('button')) as HTMLElement | null)?.focus()
})
onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow
  const app = document.getElementById('app')
  if (app) app.inert = previousInert
  previousFocus?.focus()
})
</script>

<template>
  <Teleport to="body"><div class="modal-backdrop" @click.self="close"><section ref="panel" class="modal-panel" :class="{ 'modal-wide': wide }" role="dialog" aria-modal="true" aria-labelledby="modal-title" :aria-busy="busy" @keydown="trap"><header class="modal-header"><h2 id="modal-title">{{ title }}</h2><button class="icon-button" aria-label="关闭对话框" :disabled="busy" @click="close"><AppIcon name="close" /></button></header><div class="modal-body"><slot /></div><footer v-if="$slots.footer" class="modal-footer"><slot name="footer" /></footer></section></div></Teleport>
</template>
