<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import ThemeSwitcher from './ThemeSwitcher.vue'
import { formatBytes, useAccount } from '../composables/account'
import { version } from '../../package.json'
const account = useAccount()
defineEmits<{ navigate: [] }>()
</script>

<template>
  <RouterLink class="brand" to="/drive" @click="$emit('navigate')"><span class="brand-mark"><AppIcon name="folder" :size="22" /></span><span>Netdisk<span class="brand-dot">.</span></span></RouterLink>
  <div class="workspace-label">个人工作空间</div>
  <nav class="primary-nav" aria-label="主导航">
    <RouterLink to="/drive" @click="$emit('navigate')"><AppIcon name="files" /><span>我的文件</span></RouterLink>
    <RouterLink to="/uploads" @click="$emit('navigate')"><AppIcon name="upload" /><span>上传管理</span></RouterLink>
    <RouterLink to="/shares" @click="$emit('navigate')"><AppIcon name="share" /><span>我的分享</span></RouterLink>
    <RouterLink to="/recycle" @click="$emit('navigate')"><AppIcon name="trash" /><span>回收站</span></RouterLink>
    <RouterLink v-if="account.user.value?.isAdmin" to="/admin/users" @click="$emit('navigate')"><AppIcon name="settings" /><span>管理控制台</span></RouterLink>
  </nav>
  <div class="sidebar-spacer" />
  <div v-if="account.authenticated.value" class="storage-usage"><div class="storage-heading"><AppIcon name="folder" :size="16" /><strong>我的空间</strong><span v-if="account.space.value">{{ Math.round(account.spacePercent.value) }}%</span></div><template v-if="account.space.value"><div class="space-track" role="progressbar" aria-label="已使用存储空间" :aria-valuenow="Math.round(account.spacePercent.value)" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${account.spacePercent.value}%` }" /></div><p>{{ formatBytes(account.space.value.useSpace) }} / {{ formatBytes(account.space.value.totalSpace) }}</p></template><p v-else>空间信息暂不可用 <button type="button" @click="account.refreshSpace">重试</button></p></div>
  <div v-else class="storage-note"><span class="storage-icon"><AppIcon name="folder" :size="17" /></span><div><strong>为重要的事物留一处空间</strong><span>文件、灵感，以及更多。</span></div></div>
  <div class="sidebar-footer">
    <RouterLink class="appearance-link" to="/settings" @click="$emit('navigate')"><AppIcon name="user" :size="19" /><span>个人设置</span><AppIcon name="chevron" :size="14" /></RouterLink>
    <RouterLink class="appearance-link" to="/appearance" @click="$emit('navigate')"><AppIcon name="settings" :size="19" /><span>外观设置</span><AppIcon name="chevron" :size="14" /></RouterLink>
    <ThemeSwitcher />
    <p class="version-label">NETDISK <span>v{{ version }}</span></p>
  </div>
</template>
