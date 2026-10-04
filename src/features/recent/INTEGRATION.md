# 最近文件接线

增加登录路由 `/recent`，组件 `features/recent/RecentView.vue`，侧栏可命名“最近文件”。页面读取 `/file/recent?pageNo=...&pageSize=...`，最近指更新时间，不推断访问行为。

点击“所在位置”会逐级验证父链，按普通文件列表相同的排序与分页查找目标，跳转到：

```text
/drive?path=父目录ID链&page=实际页码&size=100&sort=lastUpdateTime&direction=desc&focus=文件ID
```

根目录不传 `path`。会先读取目标目录的目录项数量，跳过纯目录分页，再寻找文件，以免大批文件夹排在前面时误跳第一页。定位可取消，30 秒超时；目录链最多 100 层，额外文件分页最多 100 页。位置变化、目录失效或超出有界查询范围会提示重试/手动查找，不报告假定位。

## Drive 高亮与焦点

不需要修改 `FileCollection`。在 Drive 的文件列表外层绑定 DOM ref，接入 `useFileFocus`：

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

把 `fileSurface` 绑定到当前 FileCollection 的包裹元素，按需显示 `focusError`。辅助函数根据实际返回页的条目顺序滚动并把键盘焦点放到名称按钮，列表/网格均支持；目标不在页内不会选择第一项冒充定位。同一 focus 参数只消费一次，后续刷新不会持续抢焦点；也可在处理后清掉路由中的 `focus`。

该模块与复制/ZIP 模块互不依赖，可独立发布。测试覆盖真实分页参数、父链与分页定位、失效/循环/取消、会话切换、行高亮和焦点；没有操作真实浏览器。
