# 复制与批量 ZIP 下载接线

本模块只增加功能组件，不修改 Drive、FileCollection、路由或全局样式。

## 入口

可直接挂载 `FileOperations.vue`：

```vue
<FileOperations
  :files="selectedFiles"
  :disabled="loading"
  @copied="handleCopied"
  @download-started="showDownloadStarted"
/>
```

也可分别使用 `CopyToDialog.vue` 与 `ZipDownloadDialog.vue`。两者接收 `files: FileItem[]`，并要求处理 `close` 事件；打开时固定本次选择，避免背景刷新替换正在确认的对象。父组件应保持操作组件挂载，不能因背景刷新清空选择就销毁正在执行的对话框；可使用 `v-show` 或把对话框移到选择工具栏的条件块之外。

`copied` 事件返回 `{items,destination:{id,name}}`，`items` 是后端实际返回的新顶层条目，目录与子项同时选择时可能比选择数少。建议用返回数量显示成功提示；源目录及文件保持不变。模块成功后刷新账户容量并发送现有 `netdisk:files-changed` 事件。

`downloadStarted` 返回 `{count}`，代表去重后的选择数，不能视作最终归档条目数或已下载完成。页面提示“已开始 ZIP 下载，请查看浏览器下载列表”。

## 约束和接口

- 只用于当前账户的正常文件，允许同一用户跨目录及同名选择。显式混入其他用户、非法路径/名称、未完成项、矛盾的同 ID 快照会整体拒绝，不偷偷过滤后部分处理。
- 复制 POST `/file/copyFile`，表单仅 `fileIds` 与 `filePid`，返回新 `FileInfoVO[]`。允许复制到当前父目录，由后端唯一化名称。
- 目标选择复用 `FolderPicker`。目录选择接口最多接收 500 个排除项，组件展示排除集合的前 500 个目录，但提交前仍沿完整父链检查所有选中目录，防止自身/后代循环。后端会再次验证最新树和配额。
- ZIP POST `/file/createZipDownloadUrl`，表单 `fileIds`；响应是 **43 位 Base64URL** 短码（字符包括 `_`、`-`），不是普通下载的 50 位字母数字码。
- 使用浏览器原生链接 GET `/file/downloadZip/{code}`，Cookie 随同源请求发送，不 fetch 整包到内存，不缓存/传播短码。归档文件名由服务端 UTF-8 Content-Disposition 决定。
- 签发失败不发起下载；签发成功仅表示下载开始，不报告传输完成。内容变化、权限撤销和传输失败需要重新发起，ZIP 不支持 Range 续传。

每次最多选择 1000 项，归档/复制树的 10000 条目上限由后端校验。调用方仍应展示失败消息，不假定只检查顶层状态即可完成整个目录。

本目录测试覆盖实际请求参数、选择混合、目录循环、复制失败/读回、签发失败、43 位码、原生下载与会话变化。
