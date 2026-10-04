export type UploadOutcome = 'uploading' | 'upload_finish' | 'upload_seconds'
export interface UploadReply { fileId: string; status: UploadOutcome }
export type ServerUploadState = 'uploading' | 'completed' | 'cancelled' | 'expired'
export interface ServerUploadTask {
  fileId: string
  fileName: string
  filePid: string
  actualFileName?: string | null
  navigationPath?: string | null
  fileMd5: string
  chunks: number
  state: ServerUploadState
  uploadStatus: UploadOutcome | null
  receivedChunks: { index: number; size: number }[]
  receivedCount: number
  receivedBytes: number
  temporaryBytes: number
  fileSize: number | null
  fileAvailable: boolean
  createdAt: number
  updatedAt: number
  expiresAt: number
}
export interface UploadTaskPage { list: ServerUploadTask[]; totalCount: number; pageNo: number; pageSize: number; pageTotal: number }
export interface UploadChunk {
  fileId?: string
  fileName: string
  filePid: string
  fileMd5: string
  chunks: number
  chunkIndex: number
  blob: Blob
}
export type LocalUploadState = 'queued' | 'hashing' | 'uploading' | 'paused' | 'error' | 'completed' | 'cancelled' | 'cancelling'
export interface LocalUploadTask {
  localId: string
  fileId?: string
  fileName: string
  filePid: string
  destinationName: string
  fileSize: number
  chunkSize: number
  chunks: number
  fileMd5: string
  state: LocalUploadState
  hashProgress: number
  confirmedBytes: number
  inFlightBytes: number
  speed: number
  error: string
  uncertain: boolean
  submitted: boolean
  uploadStatus?: UploadOutcome
}
