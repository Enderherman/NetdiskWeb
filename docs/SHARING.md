# 分享使用与接口说明

本模块位于 `src/features/shares/`，通过“我的分享”、文件详情和单选工具栏进入。组件只调用真实后端接口；测试数据只在 `__tests__` 和测试文件中使用。

## 组件

- `ShareCreateDialog.vue`：`file` 接受模块导出的 `FileEntry`，它是现有 `FileItem` 的类型别名；事件 `close` 表示关闭，`created` 携带服务端返回的 `ShareRecord`。支持 1/7/30 天和永久有效，可自定义 4–5 位字母数字提取码，或交给后端随机生成。创建成功后保留链接/提取码供复制，因此父组件收到 `created` 时不要立刻销毁对话框。
- `ShareManageView.vue`：分页查看本人分享、有效期、提取码、浏览次数，复制链接，单项或批量确认撤销。剪贴板不可用时显示可手动复制的内容；接口失败不更新为假成功状态。
- `PublicShareView.vue`：默认读取路由 `params.shareId`，也可通过 `shareId` prop 传入。支持游客提取、失效状态、文件夹导航与分页、安全在线预览、短码下载、登录后选择个人目录保存。当前路由为 `/s/{shareId}` 时将目录及页码写入查询参数；以 prop 嵌入其他页面时使用组件内导航状态。

各组件导入自己的 `shares.css`，复用现有主题变量、按钮、文件列表、对话框与文件夹选择器。公共页使用应用提供的 `ThemeSwitcher`，继续支持明暗主题。不得同时套两层 `ModalDialog`；文件详情中打开创建分享时，应先关闭原详情弹窗。

## 根应用接线

1. 在 `router/index.ts` 注册 `/shares`（`ShareManageView`，受保护，标题“我的分享”）与 `/s/:shareId`（`PublicShareView`，`meta: { public: true, title: '文件分享' }`）。公共路由不需要 `props: true`，但兼容传入 prop。
2. 必须修正当前 `guards.ts` 对 `meta.public` 的处理。现有逻辑会把所有已登录用户从公共页面重定向走；只有 `/auth/*` 登录/注册/找回页应在已经登录时跳转。`/s/:shareId` 必须同时允许已登录用户与游客访问。例如，在 public 分支中仅当 `authenticated && to.path.startsWith('/auth/')` 时执行原登录后跳转，其余 public 页面直接返回 `true`。
3. `App.vue` 已对 `meta.public` 使用无侧栏的 `RouterView`，并在公共页收到 901 事件时只清除账户状态而不自动跳走；保留此行为，让公共页显示登录提示。公共页仍需处于 App 的主题 provider 和 Vue Router 环境下。
4. 侧栏增加 `/shares` 链接；文件列表/详情只在单选且 `status === 2` 时显示“分享”操作，给 `ShareCreateDialog` 传入真实 `FileItem`。`close` 清除目标，`created` 可刷新分享计数/提示，但保留结果界面以便复制链接。
5. 部署的前端服务器需将 `/s/**` 等 SPA 路径回退至 `index.html`；`/api` 继续代理到后端。分享链接基于当前前端页面的 origin 生成，不把 API 地址当作网页地址。

## API 契约

沿用 `api/client.ts` 的 Cookie 会话、表单请求和业务码检查，读取方法使用 GET，写入全部 POST：

| 功能 | 路径与参数 |
| --- | --- |
| 创建 | `/share/shareFile`：`fileId, validType, code?`，有效期枚举 0/1/2/3 分别为 1/7/30 天/永久。 |
| 管理列表 | `/share/loadShareList?pageNo=&pageSize=`。 |
| 撤销 | `/share/cancelShare`：`shareIds` 逗号分隔。 |
| 公共概要 | `/showShare/getShareInfo?shareId=`。 |
| 提取状态 | `/showShare/getShareLoginInfo?shareId=`，返回 null 表示尚未提取。 |
| 提取码 | `/showShare/checkShareCode`：`shareId,code`。 |
| 公共列表 | `/showShare/loadFileList?shareId=&filePid=&pageNo=&pageSize=`，`filePid=0` 是分享入口。 |
| 面包屑 | `/showShare/getFolderInfo?shareId=&path=`，path 为目录 ID 的 `/` 分隔链。 |
| 原件预览 | PreviewModal 使用 GET `/showShare/content/{shareId}/{fileId}`；浏览器不支持的格式可能下载原件。 |
| 下载 | POST `/showShare/createDownloadUrl/{shareId}/{fileId}` 获取短码，再交由浏览器 GET `/showShare/download/{code}`。不会把整文件读入前端内存。 |
| 保存 | `/showShare/saveShare`：`shareId,shareFileIds,myFolderId`。目标用本人 `FolderPicker`，不能把分享者目录作为个人目标。 |

公共预览复用 PreviewModal，并按分享权限请求内容和缩略图；不会误用当前账号的私有文件接口。目录下载暂提示先保存到本人网盘，再使用私有 ZIP 下载；不会错误地调用单文件下载接口。

## 失败与登录返回

- 902 显示分享已失效/不存在并清空旧列表；903 返回提取码输入；其他请求错误保留可重试状态。
- 保存遇到业务 901 或 HTTP 401 时关闭个人目录窗口、清除旧账户状态并显示重新登录提示。
- 登录返回值只由已校验的分享 ID、当前目录 ID 链和页码构造为 `/s/...`。不会读取页面中外部提供的 `redirect` 参数，不接受站外跳转；返回后仍由用户确认所选内容及保存位置，不会自动写入网盘。
- 本人分享不提供“保存到我的网盘”入口。空间不足等保存错误保留目标选择并显示后端消息；只有实际保存成功才提示完成并刷新容量。
- 日期按后端契约的北京时间解析。复制剪贴板必须等待浏览器确认；下载只提示“已请求下载”，不把短码签发当作下载完成。

## 自动化检查

模块内 API、对话框、分享管理、公共页测试覆盖表单字段/POST 约束、错误提取码、游客导航/下载、真实成功响应、撤销确认/重试、剪贴板失败、401 安全回跳、保存配额失败、本人分享、失效/需重新提取、迟到请求隔离及日期时区。

路由守卫另覆盖游客/已登录用户访问公共页及安全登录回跳；接线测试覆盖详情切换为单层分享窗口和创建后保留复制结果。

## 2026-10-05 浏览器联调

已对接真实 MySQL/Redis 完成：文件详情创建自定义提取码分享、错误提取码拒绝、正确提取、本人分享标识、游客文本预览、原生下载并逐字节比对118 B原件、游客保存提示登录、第二测试账号登录后返回分享页、选择个人目录保存并从其文件页重新打开原件、分享管理撤销及旧链接立即显示失效。截图位于 `docs/screenshots/v0.6-share-*.png`。全部数据为本地隔离测试数据。
