<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import ModalDialog from '../../components/ModalDialog.vue'
import AppIcon from '../../components/AppIcon.vue'
import { errorMessage } from '../../composables/account'
import { fileIcon } from '../../composables/filePresentation'
import { sharesApi } from './api'
import { copyShareText, shareExpiry, shareText, shareUrl, validityOptions } from './presentation'
import type { FileEntry, ShareRecord, ShareValidity } from './types'
import './shares.css'

const props = defineProps<{ file: FileEntry }>()
const emit = defineEmits<{ close: []; created: [share: ShareRecord] }>()
const validity = ref<ShareValidity>(1)
const customCode = ref(false)
const code = ref('')
const busy = ref(false)
const copying = ref(false)
const error = ref('')
const notice = ref('')
const result = ref<ShareRecord | null>(null)
const resultText = ref<HTMLTextAreaElement>()
const text = computed(() => result.value ? shareText(result.value, props.file.fileName) : '')

async function create() {
  if (busy.value || result.value) return
  error.value = ''; notice.value = ''
  if (props.file.status !== 2) { error.value = '文件尚未处理完成，请稍后再分享'; return }
  if (customCode.value && !/^[A-Za-z0-9]{4,5}$/.test(code.value)) { error.value = '提取码需为 4–5 位字母或数字'; return }
  busy.value = true
  try {
    result.value = await sharesApi.create(props.file.fileId, validity.value, customCode.value ? code.value : '')
    emit('created', result.value)
    await nextTick()
    resultText.value?.focus()
  } catch (reason) { error.value = errorMessage(reason) }
  finally { busy.value = false }
}
async function copy() {
  if (copying.value) return
  copying.value = true; error.value = ''; notice.value = ''
  try { await copyShareText(text.value); notice.value = '链接和提取码已复制' }
  catch (reason) { error.value = errorMessage(reason) }
  finally { copying.value = false }
}
</script>

<template>
  <ModalDialog :title="result ? '分享已创建' : '分享文件'" :busy="busy || copying" @close="emit('close')">
    <div class="share-target"><span><AppIcon :name="fileIcon(file)" :size="26" /></span><strong>{{ file.fileName }}</strong></div>
    <form v-if="!result" id="share-create-form" @submit.prevent="create">
      <div class="form-field"><label for="share-validity">链接有效期</label><select id="share-validity" v-model="validity" class="share-select" :disabled="busy"><option v-for="option in validityOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></div>
      <label class="share-inline-choice"><input v-model="customCode" type="checkbox" :disabled="busy" />自定义提取码</label>
      <div v-if="customCode" class="form-field"><label for="share-custom-code">提取码</label><input id="share-custom-code" v-model="code" maxlength="5" autocomplete="off" autocapitalize="off" :disabled="busy" placeholder="4–5 位字母或数字" /></div>
      <p class="field-hint">{{ customCode ? '提取码区分大小写。' : '创建时会为你生成随机提取码。' }}可在“我的分享”中随时取消分享。</p>
    </form>
    <div v-else class="share-result"><p class="share-result-heading"><AppIcon name="check" :size="18" />链接已就绪</p><p class="share-meta">{{ result.expireTime ? `到期时间：${shareExpiry(result.expireTime)}` : '永久有效，直到你主动取消' }}</p><textarea ref="resultText" class="share-copy-area" aria-label="分享链接和提取码" :value="text" readonly @focus="($event.target as HTMLTextAreaElement).select()" /><a class="secondary-button" :href="shareUrl(result.shareId)" target="_blank" rel="noopener noreferrer">打开分享页<AppIcon name="arrow" :size="15" /></a></div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p><p v-if="notice" class="form-notice success" role="status">{{ notice }}</p>
    <template #footer><button class="secondary-button" :disabled="busy || copying" @click="emit('close')">{{ result ? '完成' : '取消' }}</button><button v-if="!result" class="primary-button" form="share-create-form" type="submit" :disabled="busy || file.status !== 2">{{ busy ? '正在创建…' : '创建分享' }}</button><button v-else class="primary-button" :disabled="copying" @click="copy">{{ copying ? '正在复制…' : '复制链接与提取码' }}</button></template>
  </ModalDialog>
</template>
