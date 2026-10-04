import { loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue()],
    // Worker 首次启动前预构建摘要依赖，避免首传时依赖发现触发整页刷新。
    optimizeDeps: { include: ['hash-wasm', 'pdfjs-dist'] },
    server: {
      watch: { ignored: ['**/.local/**'] },
      proxy: {
        '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:7090', changeOrigin: false },
      },
    },
    test: {
      environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], clearMocks: true,
      include: ['src/**/*.test.ts'],
      exclude: [...configDefaults.exclude, '.local/**'],
    },
  }
})
