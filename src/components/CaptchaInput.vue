<script setup lang="ts">
import { computed, ref } from 'vue'
import { captchaUrl } from '../api/account'

const props = defineProps<{ modelValue: string; type?: 0 | 1; id: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
let counter = 0
const revision = ref(`${Date.now()}-${counter}`)
const failed = ref(false)
const source = computed(() => captchaUrl(props.type || 0, revision.value))
function refresh() {
  revision.value = `${Date.now()}-${++counter}`
  failed.value = false
  emit('update:modelValue', '')
}
defineExpose({ refresh })
</script>

<template>
  <div class="form-field captcha-field">
    <label :for="id">图形验证码</label>
    <div class="captcha-row"><input :id="id" :value="modelValue" :disabled="disabled" autocomplete="off" maxlength="5" placeholder="输入右侧字符" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" /><button class="captcha-image" type="button" :disabled="disabled" aria-label="刷新图形验证码" title="看不清？点击刷新" @click="refresh"><img v-if="!failed" :src="source" alt="图形验证码，点击可刷新" width="130" height="38" @error="failed = true" /><span v-else>点击重新加载</span></button></div>
    <p v-if="failed" class="field-error" role="alert">图形验证码加载失败，请检查连接后刷新。</p>
  </div>
</template>
