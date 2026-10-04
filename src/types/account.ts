export interface SessionUser {
  userId: string
  nickName: string
  isAdmin: boolean
  avatar: string | null
}

export interface UserSpace {
  useSpace: number
  totalSpace: number
}

export interface LoginFields { email: string; password: string; checkCode: string }
export interface RegisterFields extends LoginFields { nickName: string; emailCode: string }
export interface ResetPasswordFields extends LoginFields { emailCode: string }
