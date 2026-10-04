<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ModalDialog from '../../components/ModalDialog.vue'
import FolderPicker from '../../components/FolderPicker.vue'
import { errorMessage, useAccount } from '../../composables/account'
import type { FileItem } from '../../types/files'
import { normalizeSelection } from './selection'
import { operationsApi, validateCopyDestination } from './api'
import type { CopyResult } from './types'
import './operations.css'

const props = defineProps<{ files: readonly FileItem[] }>()
const emit = defineEmits<{ close: []; copied: [result: CopyResult] }>()
const account = useAccount()
const owner = account.user.value?.userId || ''
// 打开后固定本次选择，后台刷新不能替换用户正在确认的对象。
const snapshot = props.files.map(file => ({ ...file }))
let sourceFiles: FileItem[] = []
const selectionError = ref('')
try { sourceFiles = normalizeSelection(snapshot, owner) } catch (reason) { selectionError.value = errorMessage(reason) }
const folders = new Set(sourceFiles.filter(file => file.folderType === 1).map(file => file.fileId))
// 目录选择接口最多接收 500 个排除项；提交前仍核对全部选中目录的完整祖先链。
const pickerExclusions = [...folders].slice(0, 500)
const destination = ref({ id: '0', name: '全部文件', valid: false })
const busy = ref(false), error = ref('')
const usable = computed(() => destination.value.valid && !folders.has(destination.value.id) && !selectionError.value)
let disposed = false
let controller: AbortController | undefined
async function copy() {
  if (busy.value || !usable.value || account.user.value?.userId !== owner) return
  busy.value = true; error.value = ''; controller = new AbortController()
  const chosen = { id: destination.value.id, name: destination.value.name }
  try {
    await validateCopyDestination(chosen.id, folders, controller.signal)
    if (disposed || account.user.value?.userId !== owner) return
    const items = await operationsApi.copy(sourceFiles.map(file => file.fileId), chosen.id)
    if (disposed || account.user.value?.userId !== owner) return
    void account.refreshSpace()
    window.dispatchEvent(new Event('netdisk:files-changed'))
    emit('copied', { items, destination: chosen })
  } catch (reason) { if (!disposed && account.user.value?.userId === owner) error.value = errorMessage(reason) }
  finally { if (!disposed) busy.value = false }
}
watch(() => account.user.value?.userId, id => { if (id !== owner) { controller?.abort(); emit('close') } })
onBeforeUnmount(() => { disposed = true; controller?.abort() })
</script>

<template>
  <ModalDialog title="复制到文件夹" :busy="busy" @close="emit('close')">
    <p v-if="selectionError" class="form-error" role="alert">{{ selectionError }}</p>
    <template v-else><p class="dialog-description">为这 {{ sourceFiles.length }} 项选择目标目录。源文件会保留；同名副本自动添加序号，并计入存储空间。</p><ul class="operations-targets"><li v-for="file in sourceFiles.slice(0, 5)" :key="file.fileId">{{ file.fileName }}</li><li v-if="sourceFiles.length > 5">以及另外 {{ sourceFiles.length - 5 }} 项</li></ul><FolderPicker :excluded-ids="pickerExclusions" :disabled="busy" @destination="destination = $event" /><p class="operations-destination">目标：{{ destination.name }}</p></template>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <template #footer><button class="secondary-button" :disabled="busy" @click="emit('close')">取消</button><button class="primary-button" :disabled="busy || !usable" @click="copy">{{ busy ? '正在复制…' : '复制到这里' }}</button></template>
  </ModalDialog>
</template>
