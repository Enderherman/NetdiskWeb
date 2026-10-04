<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { errorMessage, useAccount } from '../../composables/account'
import type { FileItem } from '../../types/files'
import { normalizeSelection } from './selection'
import { operationsApi, zipDownloadUrl } from './api'
import type { ZipStarted } from './types'
import './operations.css'

const props = defineProps<{ files: readonly FileItem[] }>()
const emit = defineEmits<{ close: []; started: [result: ZipStarted] }>()
const account = useAccount()
const owner = account.user.value?.userId || ''
let sourceFiles: FileItem[] = []
const selectionError = ref('')
try { sourceFiles = normalizeSelection(props.files.map(file => ({ ...file })), owner) } catch (reason) { selectionError.value = errorMessage(reason) }
const busy = ref(false), error = ref(''), notice = ref('')
let disposed = false
async function download() {
  if (busy.value || selectionError.value || account.user.value?.userId !== owner) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const code = await operationsApi.zipCode(sourceFiles.map(file => file.fileId))
    if (disposed || account.user.value?.userId !== owner) return
    const link = document.createElement('a')
    link.href = zipDownloadUrl(code)
    link.download = '' // 归档名称由服务端 UTF-8 Content-Disposition 决定，不能猜测祖先折叠后的名称。
    document.body.append(link); link.click(); link.remove()
    notice.value = '已开始 ZIP 下载，请查看浏览器下载列表。'
    emit('started', { count: sourceFiles.length })
  } catch (reason) { if (!disposed && account.user.value?.userId === owner) error.value = errorMessage(reason) }
  finally { if (!disposed) busy.value = false }
}
watch(() => account.user.value?.userId, id => { if (id !== owner) emit('close') })
onBeforeUnmount(() => { disposed = true })
</script>

<template>
  <ModalDialog title="打包下载" :busy="busy" @close="emit('close')"><p v-if="selectionError" class="form-error" role="alert">{{ selectionError }}</p><template v-else><p class="dialog-description">将这 {{ sourceFiles.length }} 项打包为 ZIP。可跨目录选择，重名项会自动添加序号；同时选择目录和其子项时只归档一次。</p><ul class="operations-targets"><li v-for="file in sourceFiles.slice(0, 8)" :key="file.fileId">{{ file.fileName }}<span v-if="file.folderType === 1">（含子目录和文件）</span></li><li v-if="sourceFiles.length > 8">以及另外 {{ sourceFiles.length - 8 }} 项</li></ul><p class="operations-note">归档不会新增网盘占用。文件夹内若有尚未处理完成的内容，本次请求会被拒绝。ZIP 下载不支持断点续传；若中途失败或内容有变动，请重新发起。</p></template><p v-if="error" class="form-error" role="alert">{{ error }}</p><p v-if="notice" class="form-notice success" role="status">{{ notice }}</p><template #footer><button class="secondary-button" :disabled="busy" @click="emit('close')">关闭</button><button class="primary-button" :disabled="busy || Boolean(selectionError)" @click="download">{{ busy ? '正在准备下载…' : notice ? '重新发起下载' : '开始 ZIP 下载' }}</button></template></ModalDialog>
</template>
