import { createRouter, createWebHistory } from 'vue-router'
import DriveView from '../views/DriveView.vue'
import AppearanceView from '../views/AppearanceView.vue'
import AuthView from '../views/AuthView.vue'
import UploadView from '../views/UploadView.vue'
import { installAuthGuard } from './guards'

export const routes = [
  { path: '/', redirect: '/drive' },
  { path: '/auth/login', component: AuthView, meta: { title: '登录', public: true } },
  { path: '/auth/register', component: AuthView, meta: { title: '创建账号', public: true } },
  { path: '/auth/reset', component: AuthView, meta: { title: '找回密码', public: true } },
  { path: '/drive', component: DriveView, meta: { title: '我的文件' } },
  { path: '/uploads', component: UploadView, meta: { title: '上传管理' } },
  { path: '/appearance', component: AppearanceView, meta: { title: '外观设置' } },
  { path: '/:pathMatch(.*)*', redirect: '/drive' },
]

export const router = createRouter({ history: createWebHistory(), routes })
installAuthGuard(router)
router.afterEach((route) => {
  document.title = `${String(route.meta.title || '我的云端空间')} · Netdisk`
})
