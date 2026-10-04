<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import type { FileItem } from '../../types/files'
import CopyToDialog from './CopyToDialog.vue'
import ZipDownloadDialog from './ZipDownloadDialog.vue'
import type { CopyResult, ZipStarted } from './types'
import './operations.css'

const props = defineProps<{ files: readonly FileItem[]; disabled?: boolean }>()
const emit = defineEmits<{ copied: [result: CopyResult]; downloadStarted: [result: ZipStarted] }>()
const dialog = ref<'copy' | 'zip' | null>(null)
const snapshot = ref<FileItem[]>([])
function open(kind: 'copy' | 'zip') { if (!props.disabled && props.files.length) { snapshot.value = props.files.map(file => ({ ...file })); dialog.value = kind } }
function copied(result: CopyResult) { dialog.value = null; emit('copied', result) }
</script>
<template><span class="file-operations"><button :disabled="disabled || !files.length" @click="open('copy')"><AppIcon name="files" :size="16" />复制到…</button><button :disabled="disabled || !files.length" @click="open('zip')"><AppIcon name="download" :size="16" />打包下载</button><CopyToDialog v-if="dialog === 'copy'" :files="snapshot" @close="dialog = null" @copied="copied" /><ZipDownloadDialog v-if="dialog === 'zip'" :files="snapshot" @close="dialog = null" @started="emit('downloadStarted', $event)" /></span></template>
