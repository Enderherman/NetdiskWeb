# Netdisk Web

Netdisk 的独立前端，使用 Vue 3、TypeScript 和 Vite 构建，采用简洁、中性的界面风格，支持浅色、深色及跟随系统。对应后端：[Enderherman/Netdisk](https://github.com/Enderherman/Netdisk)。

**当前版本：v0.1.0（界面基础）**。本版本只交付响应式导航、外观设置及 API 基础结构。尚未接入登录、文件、分享或回收站接口；页面不使用虚构文件、用户身份或容量数据。功能入口尚未开放时会明确禁用。

## 本地运行

需要 Node.js 22.12 及以上。

```sh
npm ci
npm run dev
```

默认访问 `http://127.0.0.1:5173`。复制 `.env.example` 为 `.env.local` 可指定后端开发代理地址；本版本界面不主动调用业务接口。生产构建使用 `npm run build`，产物位于 `dist/`，可通过 `npm run preview` 检查。

生产部署需将未知前端路由回退至 `index.html`，并将 `/api` 代理到后端，避免跨域 Cookie 会话问题。真实业务功能接入时以已验证的后端部署配置为准。

## 本版本功能

- 桌面固定侧栏、手机导航抽屉、主要内容跳转与键盘焦点管理。
- 浅色、深色、跟随系统三态配色；浏览器保存偏好；多标签同步；跟随系统时实时响应设备变化。
- 外观设置页与共享主题控件。
- Router、Cookie 会话 API 客户端与后端通用响应类型，为逐项接入业务保留独立模块。

## 验证

```sh
npm test
npm run typecheck
npm run build
```

测试覆盖主题恢复/系统变更/受限存储/跨标签同步，抽屉展开/遮罩关闭/Escape/焦点循环/路由切换，以及 API 会话和错误响应约定。这些是前端单元及组件测试，不代表后端联调已完成。

## 版本与开发约定

每项功能实现、测试、复核后独立提交和推送。版本采用 `主版本.次版本.修订版本`；业务功能增量提升次版本，兼容修复提升修订版本。README 说明如何使用项目；版本变更和每项验证记录单独维护在 [UPDATELOG.md](./UPDATELOG.md)。

## 目录

```text
src/api/          请求与业务 API
src/components/   外壳、导航与共享组件
src/composables/  共享状态与主题
src/router/       页面路由
src/types/        后端接口类型
src/views/        页面
src/test/         测试环境
```
