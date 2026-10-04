<script setup lang="ts">
defineProps<{ ready: boolean; message: string }>()
</script>
<template><div class="admin-state"><p v-if="!ready" role="status">正在验证管理权限…</p><template v-else><h2>需要管理员权限</h2><p role="alert">{{ message }}</p><RouterLink class="secondary-button" to="/drive">返回我的文件</RouterLink></template></div></template>
