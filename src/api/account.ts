import { baseUrl, postForm, request } from './client'
import type { LoginFields, RegisterFields, ResetPasswordFields, SessionUser, UserSpace } from '../types/account'

export const accountApi = {
  capabilities: () => request<{ emailVerificationEnabled: boolean; qqLoginEnabled: boolean }>('/accountCapabilities'),
  current: () => request<SessionUser>('/getUserInfo'),
  space: () => request<UserSpace>('/getUseSpace'),
  login: (fields: LoginFields) => postForm<SessionUser>('/login', { ...fields }),
  register: (fields: RegisterFields) => postForm<null>('/register', { ...fields }),
  resetPassword: (fields: ResetPasswordFields) => postForm<null>('/resetPwd', { ...fields }),
  sendEmailCode: (email: string, checkCode: string, type: 0 | 1) => postForm<null>('/sendEmailCode', { email, checkCode, type: String(type) }),
  logout: () => postForm<null>('/logout', {}),
}

export function captchaUrl(type: 0 | 1, revision: string): string {
  return `${baseUrl}/checkCode?type=${type}&v=${encodeURIComponent(revision)}`
}
