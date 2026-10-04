<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue'
</script>

<template>
  <section class="drive-view">
    <div class="page-heading"><div><p class="eyebrow">YOUR PERSONAL CLOUD</p><h1>我的文件<span class="heading-period">.</span></h1><p class="page-description">让重要的文件，始终触手可及。</p></div><div class="page-actions"><button class="secondary-button" disabled title="文件功能即将开放"><AppIcon name="plus" :size="17" /><span>新建文件夹</span></button><button class="primary-button" disabled title="文件功能即将开放"><AppIcon name="upload" :size="17" /><span>上传文件</span></button></div></div>
    <div class="welcome-card"><div class="welcome-symbol"><AppIcon name="folder" :size="23" /></div><div><h2>一个空间，装下你的日常。</h2><p>从工作文档到生活片段，让每一份重要都有归处。</p></div><span class="welcome-tag">简单 · 私有 · 有序</span></div>
    <section class="file-surface" aria-labelledby="files-title">
      <div class="file-toolbar"><h2 id="files-title"><AppIcon name="folder" :size="18" />全部文件</h2><span class="availability-label">即将开放</span></div>
      <div class="empty-state">
        <div class="empty-illustration" aria-hidden="true"><div class="illustration-orbit orbit-one" /><div class="illustration-orbit orbit-two" /><div class="file-sheet sheet-back"><i /><i /><i /></div><div class="file-sheet sheet-front"><AppIcon name="files" :size="25" /><i /><i /></div><div class="folder-art"><span /><AppIcon name="folder" :size="40" /></div><span class="illustration-spark spark-one">+</span><span class="illustration-spark spark-two">+</span></div>
        <p class="empty-eyebrow">A LITTLE SPACE FOR EVERYTHING</p><h2>你的云端空间，正在启程</h2><p class="empty-description">上传、整理、分享，更多文件功能即将到来。<br />先选择喜欢的外观，让空间更像你。</p><RouterLink class="text-link" to="/appearance">选择我的外观<AppIcon name="arrow" :size="17" /></RouterLink>
      </div>
      <div class="file-bottom-note"><span class="small-dot" />当前为界面预览，尚未显示云端文件。</div>
    </section>
  </section>
</template>
