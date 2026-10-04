import { createRouter, createWebHistory } from 'vue-router'
import DriveView from '../views/DriveView.vue'
import AppearanceView from '../views/AppearanceView.vue'
import AuthView from '../views/AuthView.vue'
import UploadView from '../views/UploadView.vue'
import ShareManageView from '../features/shares/ShareManageView.vue'
import PublicShareView from '../features/shares/PublicShareView.vue'
import RecycleView from '../features/recycle/RecycleView.vue'
import SettingsView from '../features/settings/SettingsView.vue'
import AdminUsersView from '../features/admin/AdminUsersView.vue'
import AdminFilesView from '../features/admin/AdminFilesView.vue'
import AdminSystemView from '../features/admin/AdminSystemView.vue'
import AdminAccessNotice from '../features/admin/AdminAccessNotice.vue'
import { installAuthGuard } from './guards'

export const routes = [
  { path: '/', redirect: '/drive' },
  { path: '/auth/login', component: AuthView, meta: { title: '登录', public: true } },
  { path: '/auth/register', component: AuthView, meta: { title: '创建账号', public: true } },
  { path: '/auth/reset', component: AuthView, meta: { title: '找回密码', public: true } },
  { path: '/drive', component: DriveView, meta: { title: '我的文件' } },
  { path: '/uploads', component: UploadView, meta: { title: '上传管理' } },
  { path: '/shares', component: ShareManageView, meta: { title: '我的分享' } },
  { path: '/recycle', component: RecycleView, meta: { title: '回收站' } },
  { path: '/settings', component: SettingsView, meta: { title: '个人设置' } },
  { path: '/admin/users', component: AdminUsersView, meta: { title: '用户管理', admin: true } },
  { path: '/admin/files', component: AdminFilesView, meta: { title: '文件管理', admin: true } },
  { path: '/admin/system', component: AdminSystemView, meta: { title: '系统设置', admin: true } },
  { path: '/forbidden', component: AdminAccessNotice, props: { ready: true, message: '当前账户没有管理权限，请使用自己的文件空间。' }, meta: { title: '访问受限' } },
  { path: '/s/:shareId', component: PublicShareView, meta: { title: '文件分享', public: true } },
  { path: '/appearance', component: AppearanceView, meta: { title: '外观设置' } },
  { path: '/:pathMatch(.*)*', redirect: '/drive' },
]

export const router = createRouter({ history: createWebHistory(), routes })
installAuthGuard(router)
router.afterEach((route) => {
  document.title = `${String(route.meta.title || '我的云端空间')} · Netdisk`
})
