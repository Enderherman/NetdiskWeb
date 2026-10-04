<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import ThemeSwitcher from './ThemeSwitcher.vue'
defineEmits<{ navigate: [] }>()
</script>

<template>
  <RouterLink class="brand" to="/drive" @click="$emit('navigate')"><span class="brand-mark"><AppIcon name="folder" :size="22" /></span><span>Netdisk<span class="brand-dot">.</span></span></RouterLink>
  <div class="workspace-label">个人工作空间</div>
  <nav class="primary-nav" aria-label="主导航">
    <RouterLink to="/drive" @click="$emit('navigate')"><AppIcon name="files" /><span>我的文件</span></RouterLink>
    <button disabled title="最近使用即将开放"><AppIcon name="clock" /><span>最近使用</span><span class="nav-soon">即将开放</span></button>
    <button disabled title="分享功能即将开放"><AppIcon name="share" /><span>我的分享</span></button>
    <button disabled title="回收站即将开放"><AppIcon name="trash" /><span>回收站</span></button>
  </nav>
  <div class="sidebar-spacer" />
  <div class="storage-note"><span class="storage-icon"><AppIcon name="folder" :size="17" /></span><div><strong>为重要的事物留一处空间</strong><span>文件、灵感，以及更多。</span></div></div>
  <div class="sidebar-footer">
    <RouterLink class="appearance-link" to="/appearance" @click="$emit('navigate')"><AppIcon name="settings" :size="19" /><span>外观设置</span><AppIcon name="chevron" :size="14" /></RouterLink>
    <ThemeSwitcher />
    <p class="version-label">NETDISK <span>v0.1.0</span></p>
  </div>
</template>
