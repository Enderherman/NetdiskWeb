# 最近文件与文件定位接线

登录路由 `/recent` 已接入 `features/recent/RecentView.vue`，侧栏入口为“最近文件”。页面读取 `/file/recent?pageNo=...&pageSize=...`；“最近”指更新时间，不推断访问行为。

点击“所在位置”会逐级验证父链，按普通文件列表相同的排序与分页查找目标，跳转到：

```text
/drive?path=父目录ID链&page=实际页码&size=100&sort=lastUpdateTime&direction=desc&focus=文件ID
```

根目录不传 `path`。会先读取目标目录的目录项数量，跳过纯目录分页，再寻找文件，以免大批文件夹排在前面时误跳第一页。定位可取消，30 秒超时；目录链最多 100 层，额外文件分页最多 100 页。位置变化、目录失效或超出有界查询范围会提示重试/手动查找，不报告假定位。

## Drive 高亮与焦点

`DriveView` 已在 `FileCollection` 的包裹元素绑定 `fileSurface`，并接入 `useFileFocus`：

```ts
const fileSurface = ref<HTMLElement>()
const { focusError } = useFileFocus({
  focus: () => route.query.focus,
  items: () => page.value.list,
  loading,
  root: fileSurface,
  select: id => { selectedIds.value = [id] },
})
```

页面显示 `focusError`。辅助函数根据实际返回页的条目顺序滚动，并把键盘焦点放到名称按钮，列表/网格均支持；目标不在页内不会选择第一项冒充定位。同一 focus 参数只消费一次，后续刷新不会持续抢焦点。

## 上传完成后的复用

`src/uploads/fileLocation.ts` 先读取最新服务器任务，再按名称查询候选并核对文件 ID，将真实 `FileItem` 交给 `locateRecentFile`。因此上传后改名、移动或文件位于后续分页时，也能使用同一套父链与分页定位；不会补造文件类型、时间或其他展示资料。

上传页负责取消、超时和账号变化隔离。旧后端缺少定位字段时仍按原任务名称搜索；新后端定位失败则保留最新已知名称搜索入口。详见 [上传说明](../../../docs/UPLOADS.md)。

## 验证

自动化测试覆盖分页参数、父链与实际分页、失效/循环/取消、会话变化、选中状态和焦点。真实浏览器已验证根目录定位、文件移动后定位、手机深色页面与导航，以及上传完成文件跨过 100 个目录后进入第 2 页并选中聚焦。

功能说明和现场记录见 [最近文件](../../../docs/RECENT.md) 与 [更新日志](../../../UPDATELOG.md)。模块开发早期的独立测试记录不代表当前仍未接线或未做浏览器验收。
