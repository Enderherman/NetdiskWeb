import { loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:7090', changeOrigin: true },
      },
    },
    test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], clearMocks: true },
  }
})
