import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FileThumbnail from './FileThumbnail.vue'
import type { FileItem } from '../types/files'
const file: FileItem = { fileId: 'file123', filePid: '0', fileName: '图片.png', fileSize: 100, folderType: 0, fileType: 3, fileCategory: 3, status: 2, lastUpdateTime: null }
describe('受权缩略图', () => {
  it('只在存在封面时按fileId请求，不拼接物理路径', async () => {
    const wrapper = mount(FileThumbnail, { props: { file } })
    expect(wrapper.find('img').exists()).toBe(false)
    await wrapper.setProps({ file: { ...file, fileCover: '202610/owner/private/path.jpg' } })
    expect(wrapper.get('img').attributes('src')).toBe('/api/file/thumbnail/file123')
    expect(wrapper.get('img').attributes('loading')).toBe('lazy')
    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(true)
  })
  it('允许固定分享缩略图接口，拒绝外部地址', () => {
    const covered = { ...file, fileCover: 'cover.jpg' }
    const shared = mount(FileThumbnail, { props: { file: covered, thumbnailUrl: '/api/showShare/thumbnail/share123/file123' } })
    expect(shared.get('img').attributes('src')).toBe('/api/showShare/thumbnail/share123/file123')
    const external = mount(FileThumbnail, { props: { file: covered, thumbnailUrl: 'https://outside.example/tracker' } })
    expect(external.find('img').exists()).toBe(false)
  })
})
