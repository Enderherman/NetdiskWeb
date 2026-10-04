import type { FileItem } from '../types/files'

export function fileIcon(file: FileItem): string {
  if (file.folderType === 1) return 'folder'
  return ({ 1: 'video', 2: 'music', 3: 'image', 4: 'files' } as Record<number, string>)[file.fileCategory || 0] || 'files'
}
export function fileKind(file: FileItem): string {
  if (file.folderType === 1) return '文件夹'
  return ({ 1: '视频', 2: '音频', 3: '图片', 4: 'PDF', 5: '文档', 6: '表格', 7: '文本', 8: '代码', 9: '压缩包', 10: '文件' } as Record<number, string>)[file.fileType || 0] || '文件'
}
export function fileDate(value: string | null): string { return value ? value.replace(/:\d\d$/, '') : '—' }
export function validateFileName(value: string): string {
  if (!value || value.length > 200) return '名称需为 1–200 个字符'
  if (value !== value.trim() || value.endsWith('.')) return '名称不能以空白开头或结尾，也不能以点结尾'
  if (/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(value)) return '名称不能包含路径分隔符、控制字符或 \\ / : * ? " < > |'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) return '请换一个名称，这个名称被系统保留'
  return ''
}
