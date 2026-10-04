<script setup lang="ts">
import { onBeforeUnmount, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createTheme } from './composables/theme'
import AppShell from './components/AppShell.vue'
import { SESSION_EXPIRED_EVENT } from './api/client'
import { useAccount } from './composables/account'
provide('theme', createTheme())
const route = useRoute()
const router = useRouter()
const account = useAccount()
function onSessionExpired() {
  account.clearSession()
  if (!route.meta.public && route.path !== '/') void router.replace({ path: '/auth/login', query: { redirect: route.fullPath, expired: '1' } })
}
window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
onBeforeUnmount(() => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired))
</script>

<template><RouterView v-if="route.meta.public" /><AppShell v-else><RouterView /></AppShell></template>
