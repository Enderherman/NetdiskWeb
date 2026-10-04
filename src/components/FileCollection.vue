<script setup lang="ts">
import { computed } from 'vue'
import { formatBytes } from '../composables/account'
import { fileDate, fileIcon, fileKind } from '../composables/filePresentation'
import type { FileItem } from '../types/files'
import AppIcon from './AppIcon.vue'
const props = defineProps<{ items: FileItem[]; selected: string[]; layout: 'list' | 'grid' }>()
const emit = defineEmits<{ select: [id: string]; selectAll: [ids: string[]]; open: [file: FileItem]; detail: [file: FileItem] }>()
const allSelected = computed(() => props.items.length > 0 && props.selected.length === props.items.length)
function size(file: FileItem) { return file.folderType === 1 || file.fileSize === null ? '—' : formatBytes(file.fileSize) }
</script>

<template>
  <div v-if="layout === 'list'" class="file-table-wrap">
    <table class="file-table"><thead><tr><th class="checkbox-cell"><input type="checkbox" aria-label="选择当前页全部文件" :checked="allSelected" :indeterminate="selected.length > 0 && !allSelected" @change="emit('selectAll', allSelected ? [] : items.map(file => file.fileId))" /></th><th>名称</th><th class="file-size-cell">大小</th><th class="file-date-cell">修改时间</th><th><span class="sr-only">操作</span></th></tr></thead>
      <tbody><tr v-for="file in items" :key="file.fileId" :class="{ selected: selected.includes(file.fileId) }"><td class="checkbox-cell"><input type="checkbox" :aria-label="`选择 ${file.fileName}`" :checked="selected.includes(file.fileId)" @change="emit('select', file.fileId)" /></td><td><button class="file-name-button" @click="emit('open', file)"><span class="file-symbol" :class="{ 'is-folder': file.folderType === 1 }"><AppIcon :name="fileIcon(file)" :size="21" /></span><span class="file-name-text"><strong>{{ file.fileName }}</strong><small v-if="file.status !== 2">{{ file.status === 0 ? '处理中' : '处理失败' }}</small></span></button></td><td class="file-size-cell">{{ size(file) }}</td><td class="file-date-cell">{{ fileDate(file.lastUpdateTime) }}</td><td class="file-action-cell"><button class="icon-button" :aria-label="`${file.fileName} 的详情和操作`" @click="emit('detail', file)"><AppIcon name="more" :size="19" /></button></td></tr></tbody>
    </table>
  </div>
  <div v-else class="file-grid"><article v-for="file in items" :key="file.fileId" class="file-card" :class="{ selected: selected.includes(file.fileId) }"><div class="file-card-top"><input type="checkbox" :aria-label="`选择 ${file.fileName}`" :checked="selected.includes(file.fileId)" @change="emit('select', file.fileId)" /><button class="icon-button" :aria-label="`${file.fileName} 的详情和操作`" @click="emit('detail', file)"><AppIcon name="more" :size="19" /></button></div><button class="file-card-open" @click="emit('open', file)"><span class="file-symbol" :class="{ 'is-folder': file.folderType === 1 }"><AppIcon :name="fileIcon(file)" :size="39" /></span><strong :title="file.fileName">{{ file.fileName }}</strong><span>{{ file.status !== 2 ? (file.status === 0 ? '处理中' : '处理失败') : file.folderType === 1 ? '文件夹' : file.fileSize === null ? fileKind(file) : formatBytes(file.fileSize) }}</span></button></article></div>
</template>
