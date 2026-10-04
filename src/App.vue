<script setup lang="ts">
import { provide } from 'vue'
import { createTheme } from './composables/theme'
import AppShell from './components/AppShell.vue'
provide('theme', createTheme())
</script>

<template><AppShell><RouterView /></AppShell></template>
