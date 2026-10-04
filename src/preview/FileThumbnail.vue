<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FileItem } from '../types/files'
import { fileIcon } from '../composables/filePresentation'
import { safeFileUrl } from './previewContent'
import AppIcon from '../components/AppIcon.vue'
import './preview.css'
const props = defineProps<{ file: FileItem; size?: number; thumbnailUrl?: string }>()
const failed = ref(false)
const url = computed(() => {
  if (!props.file.fileCover || props.file.folderType !== 0 || props.file.status !== 2) return ''
  try { return safeFileUrl(props.file.fileId, props.thumbnailUrl, 'thumbnail') } catch { return '' }
})
watch(() => [props.file.fileId, props.file.fileCover, props.thumbnailUrl], () => { failed.value = false })
</script>

<template><span class="file-symbol" :class="{ 'is-folder': file.folderType === 1, 'has-thumbnail': url && !failed }"><img v-if="url && !failed" :src="url" alt="" loading="lazy" decoding="async" @error="failed = true" /><AppIcon v-else :name="fileIcon(file)" :size="size || 21" /></span></template>
