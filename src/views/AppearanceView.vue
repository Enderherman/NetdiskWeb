<script setup lang="ts">
import { inject } from 'vue'
import type { Theme, ThemePreference } from '../composables/theme'
import AppIcon from '../components/AppIcon.vue'
const theme = inject<Theme>('theme')!
const options: { value: ThemePreference; label: string; description: string; icon: string }[] = [
  { value: 'light', label: '浅色', description: '明亮纯粹，让内容自然呈现。', icon: 'sun' },
  { value: 'dark', label: '深色', description: '柔和安静，适合专注与夜晚。', icon: 'moon' },
  { value: 'system', label: '跟随系统', description: '与你的设备保持相同的节奏。', icon: 'monitor' },
]
</script>

<template>
  <section class="appearance-view"><div class="page-heading"><div><p class="eyebrow">MAKE IT YOURS</p><h1>舒服的外观<span class="heading-period">.</span></h1><p class="page-description">明亮或深邃，找到属于你的节奏。</p></div></div>
    <div class="settings-section"><div class="section-heading"><h2>配色模式</h2><p>你的选择会保存在当前浏览器中，下次打开依然如你所愿。</p></div><div class="theme-cards" role="group" aria-label="选择配色模式"><button v-for="option in options" :key="option.value" class="theme-card" :class="{ selected: theme.preference.value === option.value }" :aria-pressed="theme.preference.value === option.value" @click="theme.setPreference(option.value)"><div class="theme-preview" :class="`preview-${option.value}`" aria-hidden="true"><div class="mini-sidebar"><span /><i /><i /><i /></div><div class="mini-content"><span /><div><i /><i /><i /></div></div></div><div class="theme-card-title"><AppIcon :name="option.icon" :size="19" /><strong>{{ option.label }}</strong><span class="selection-indicator"><AppIcon v-if="theme.preference.value === option.value" name="check" :size="12" /></span></div><p>{{ option.description }}</p></button></div><p class="theme-state" role="status">当前使用{{ theme.resolved.value === 'dark' ? '深色' : '浅色' }}外观<span v-if="theme.preference.value === 'system'">，随设备设置自动变化</span>。</p></div>
  </section>
</template>
