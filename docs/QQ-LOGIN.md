# QQ 登录

前端通过 `/api/accountCapabilities` 读取真实能力。只有 `qqLoginEnabled=true` 才显示“使用 QQ 登录”；未配置时明确提示暂未开放，仍可使用邮箱登录。

点击后 POST `/api/qqlogin`，仅发送安全的站内返回路径及当前 Cookie。后端创建一次性 state，前端检查官方 `https://graph.qq.com/oauth2.0/authorize`、单一授权参数和本站 `/api/qqlogin/callback` 后导航。应用密钥、OpenID和令牌均不进入前端配置或浏览器存储。

后端回调完成后建立普通会话并重定向回站内；前端重新读取身份。取消、过期、未配置或其他失败只显示固定中文分类，不回显提供者原始错误。页面切换会取消待处理的发起请求，迟到响应不触发外站导航。

部署须使用同源API代理，并在 QQ 互联登记 `https://你的网盘域名/api/qqlogin/callback`。完整后端开关和凭据配置见[后端 QQ 说明](https://github.com/Enderherman/Netdisk/blob/master/docs/API-QQ.md)。

2026-10-05：专项测试覆盖默认关闭、重复点击、失败、离页取消、安全回跳、官方地址/回调白名单、固定错误映射。真实本地服务验证默认关闭及GET回调303回登录提示；未使用真实QQ凭据发起外部授权，配置正式应用后需进行平台联调。QQ独立账号暂不支持绑定邮箱及设置本地密码。
