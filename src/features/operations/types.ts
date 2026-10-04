import type { FileItem } from '../../types/files'

export interface CopyResult { items: FileItem[]; destination: { id: string; name: string } }
export interface ZipStarted { count: number }
