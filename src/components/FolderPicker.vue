<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { filesApi } from '../api/files'
import { errorMessage } from '../composables/account'
import type { FileItem } from '../types/files'
import AppIcon from './AppIcon.vue'
const props = defineProps<{ excludedIds: string[]; disabled?: boolean }>()
const emit = defineEmits<{ destination: [value: { id: string; name: string; valid: boolean }] }>()
const trail = ref<FileItem[]>([])
const folders = ref<FileItem[]>([])
const loading = ref(false)
const error = ref('')
const current = computed(() => trail.value.at(-1))
let generation = 0
let controller: AbortController | undefined
async function load() {
  const requestId = ++generation
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  error.value = ''
  folders.value = []
  emit('destination', { id: current.value?.fileId || '0', name: current.value?.fileName || '全部文件', valid: false })
  try {
    const result = await filesApi.folders(current.value?.fileId || '0', props.excludedIds, controller.signal)
    if (requestId !== generation) return
    folders.value = result.filter(item => !props.excludedIds.includes(item.fileId))
    emit('destination', { id: current.value?.fileId || '0', name: current.value?.fileName || '全部文件', valid: !props.excludedIds.includes(current.value?.fileId || '0') })
  } catch (reason) {
    if (requestId === generation && !(reason instanceof Error && reason.name === 'AbortError')) error.value = errorMessage(reason)
  } finally { if (requestId === generation) loading.value = false }
}
watch(() => current.value?.fileId, load)
onMounted(load)
onBeforeUnmount(() => { generation++; controller?.abort() })
</script>

<template>
  <div class="folder-picker"><nav class="folder-crumbs" aria-label="移动目标路径"><button :disabled="disabled || !trail.length" @click="trail = []">全部文件</button><template v-for="(folder, index) in trail" :key="folder.fileId"><AppIcon name="chevron" :size="12" /><button :disabled="disabled || index === trail.length - 1" @click="trail = trail.slice(0, index + 1)">{{ folder.fileName }}</button></template></nav><div v-if="loading" class="picker-state" role="status">正在读取文件夹…</div><div v-else-if="error" class="picker-state"><p role="alert">{{ error }}</p><button class="secondary-button" @click="load">重试</button></div><div v-else-if="!folders.length" class="picker-state">这里没有可进入的子文件夹</div><div v-else class="picker-folders"><button v-for="folder in folders" :key="folder.fileId" :disabled="disabled" @click="trail = [...trail, folder]"><AppIcon name="folder" /><span>{{ folder.fileName }}</span><AppIcon name="chevron" :size="15" /></button></div></div>
</template>
