import { createRouter, createWebHistory } from 'vue-router'
import DriveView from '../views/DriveView.vue'
import AppearanceView from '../views/AppearanceView.vue'

export const routes = [
  { path: '/', redirect: '/drive' },
  { path: '/drive', component: DriveView, meta: { title: '我的文件' } },
  { path: '/appearance', component: AppearanceView, meta: { title: '外观设置' } },
  { path: '/:pathMatch(.*)*', redirect: '/drive' },
]

export const router = createRouter({ history: createWebHistory(), routes })
router.afterEach((route) => {
  document.title = `${String(route.meta.title || '我的云端空间')} · Netdisk`
})
