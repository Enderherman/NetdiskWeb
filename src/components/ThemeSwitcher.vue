<script setup lang="ts">
import { inject } from 'vue'
import type { Theme, ThemePreference } from '../composables/theme'
import AppIcon from './AppIcon.vue'

const theme = inject<Theme>('theme')!
const choices: { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
  { value: 'system', label: '跟随系统', icon: 'monitor' },
]
</script>

<template>
  <div class="theme-switcher" role="group" aria-label="配色模式">
    <button v-for="choice in choices" :key="choice.value" :aria-pressed="theme.preference.value === choice.value" :title="choice.label" @click="theme.setPreference(choice.value)">
      <AppIcon :name="choice.icon" :size="17" /><span>{{ choice.label }}</span>
    </button>
  </div>
</template>
