<script setup lang="ts">
defineProps<{ name: string; size?: number }>()
const paths: Record<string, string> = {
  folder: 'M3 7V5a1 1 0 0 1 1-1h6l3 3h7a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Zm0 2h18',
  files: 'M8 3h8l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM16 3v5h4M4 6v12',
  clock: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  share: 'M15 5a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM5 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM15 19a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM9 11l6-5M9 13l6 5',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  settings: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M20.8 13.5A9 9 0 0 1 10.5 3.2 9 9 0 1 0 20.8 13.5Z',
  monitor: 'M3 4h18v13H3ZM8 21h8M12 17v4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  chevron: 'm9 5 7 7-7 7',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  check: 'm5 12 4 4L19 6',
  logout: 'M10 4H4v16h6M9 12h12m-4-4 4 4-4 4',
  search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
  move: 'M3 8V5h7l3 3h8v12H3ZM8 14h8m-3-3 3 3-3 3',
  edit: 'm15 4 5 5M4 20l5-1L21 7l-4-4L5 15l-1 5Z',
  image: 'M3 3h18v18H3ZM3 16l6-6 8 11M13 14l4-4 4 5M16 7h.01',
  video: 'M3 5h13v14H3ZM16 10l5-3v10l-5-3',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3h3M20 16a3 3 0 1 1-3-3h3',
  refresh: 'M20 7v5h-5M4 17v-5h5M20 12a8 8 0 0 0-14-5M4 12a8 8 0 0 0 14 5',
}
</script>

<template>
  <svg :width="size || 20" :height="size || 20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.folder" /></svg>
</template>
