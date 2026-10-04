/** 对应后端 top.enderherman.netdisk.common.BaseResponse。 */
export interface ApiResponse<T> {
  code: number
  data: T
  message?: string | null
  status?: string | null
}
