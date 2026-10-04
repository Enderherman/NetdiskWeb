# 个人设置与管理模块

模块只添加 `src/features/settings` 和 `src/features/admin` 下的页面、接口适配和测试，不修改全局路由、布局、侧栏、主题或依赖。所有数据由真实后端读取，未提供的邮箱和用量不会补造。

## 接线路由

| 建议路径 | 页面 | 路由元数据 |
| --- | --- | --- |
| `/settings` | `features/settings/SettingsView.vue` | `title: '个人设置'`，要求登录。 |
| `/admin/users` | `features/admin/AdminUsersView.vue` | `title: '用户管理', admin: true`。 |
| `/admin/files` | `features/admin/AdminFilesView.vue` | `title: '文件管理', admin: true`，可选 query `userId`。 |
| `/admin/system` | `features/admin/AdminSystemView.vue` | `title: '系统设置', admin: true`。 |

既有登录守卫验证成功后，对 `to.meta.admin` 额外检查 `useAccount().user.value?.isAdmin`，非管理员返回 `/drive` 或权限提示页。侧栏管理入口只向管理员展示。各管理页面本身也验证角色，角色不符时不会请求管理接口；后端仍是权限判定的依据。

三个管理页面包含局部 `AdminNavigation`，因此侧栏也可以只提供一个管理入口。个人设置改密成功会清除全局会话并跳 `/auth/login?passwordChanged=1`；登录页可以按此固定标志显示提示，不能把它当作权限凭据。

## 个人设置

- 用 `useAccount().ensureSession(true)` 读取真实昵称、角色、用户 ID，头像从 `/getAvatar/{userId}` 获取。
- `POST /updateProfile` 仅提交 `nickName`，1–20 字；成功后再次读取账户以更新全局账户栏。
- `POST /updateUserAvatar` 使用 multipart 字段 `avatar`，前端限制 JPEG/PNG/GIF/BMP、大于 0 且不超过 2 MB；实际解码、像素上限与重编码由后端复核。成功后刷新头像地址。
- `POST /updatePassword` 只发送 `currentPassword` 和 `password`，确认密码只用于前端校验。新密码须为 8–64 位并含字母和数字；密码原样传输，不做 trim。
- 接口未返回个人邮箱，页面没有邮件地址占位值。读取或修改失败显示明确错误；只有服务确认后才显示成功。

## 用户管理

`/admin/loadUserList` 只发送页码、页大小、用户 ID、昵称包含、邮箱包含和状态筛选；接收数据只保留公开 DTO 字段，丢弃意外出现的密码或会话版本。

启用/禁用通过 `/admin/updateUserStatus`，操作前显示真实对象及影响。禁用当前管理员时明确提示退出，成功后清会话并跳登录。

配额通过 `/admin/updateUserSpace` 发送整数 MB **增减量**，不是新总额。页面显示真实当前已用/总额和调整后预览；不足现有用量在前端拦截，上传中的占用由后端最终核对。保存失败不会更新列表或冒充成功。

## 文件管理

先用真实用户列表确认所属用户，再调用 `/admin/loadFileList`；没有选定用户时不查询全站文件。所有请求保留 userId，响应也检查所有者。界面不保留或展示物理路径、MD5 等内部字段。

浏览复用 `FileCollection`，只在同一所有者下选择、翻页和进入目录。搜索结果进入嵌套目录时，省略的中间层级用省略标识表示。这里不使用读取“当前账户网盘”的 `FolderPicker`，以免把管理员自己的目录误当作被管理用户目录。

- 正常且就绪的文件可打开 `/admin/content/{userId}/{fileId}` 原始内容。
- 下载先 POST `/admin/createDownloadUrl/{userId}/{fileId}` 签发短码，再访问 `/admin/download/{code}`；不会把已准备链接描述为已完成下载。
- 永久删除先展示所属用户、文件名称、子项影响及不可恢复说明，再 POST `/admin/delFile`。组合字段为 `fileId_userId`，失败保留确认框与原列表。

## 系统设置

从 `/admin/getSysSettings` 读取真实初始容量和邮件模板，POST `/admin/saveSysSettings` 保存后再次读回核对。

初始配额为 1–1048576 整数 MB；标题 1–150 字且不含控制字符；正文不超过 5000 字，必须包含字面 `%s`（`%S` 不等价）。预览以明确标注的示例验证码 12345 替换每处 `%s`，使用纯文本，绝不执行模板 HTML。保存成功但读取失败时提示核对，不显示已确认成功。

## 发布与验证

- `frontend-settings-slice.json` 只包含个人设置目录，可先独立接线与发布。
- `frontend-admin-slice.json` 包含管理目录及本文档，随后独立接线与发布。
- 两个模块共用现有主题变量和 `api/client`，没有新增依赖。
- 每个页面及接口有 Vitest 测试，覆盖角色守卫、表单边界、真实参数、分页、失败与重试、确认流程、会话失效和敏感字段白名单。

本模块开发阶段没有操作浏览器；页面视觉和真实服务交互由接线路由后的整体验收继续核对。
