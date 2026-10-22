# WP-03 控制器身份接口

本文件只描述已经实现的接口。会话签发、刷新轮换、撤销和失败即拒绝的存储都在代码里。

## 主体分离

| 主体 | 是什么 | 不是什么 |
|---|---|---|
| `upstream_account` | 上游人类账号（已验证的 IdP 登录，对应 `users` 行） | 独立模式下不会被制造出来 |
| `workspace_token` | Workspace 机器引导凭据 | 手机登录，也不是人类身份 |
| `node` | Connector 节点，由 `/v1/nodes/redeem` 配对 | 手机或桌面控制器 |
| `controller_session` | 手机或桌面控制器的短期 access 加可轮换 refresh | 节点配对码 |
| `agent` | 绑定到某一个节点、某一个 Workspace 的 Agent | 可以跨设备复用的身份 |

独立模式（`mode=standalone`）只接受 Workspace 机器凭据来引导控制器，不创建 `users` 行，`human_login` 为 false。上游模式必须出示真实人类 bearer，控制器再挂到该账号上。

机器可读合同：`GET /v1/identity/contract`，版本 `wp03.v1`。服务端稳定入口是 `app.services.identity_port`。

## 给后续工作包的接法

- **WP-04 协议与 Connector**：调用 `authorize()`，不要自己解析 access、refresh、Workspace token 或 node token。事件流使用 `POST /v1/identity/stream-ticket` 换到的一次性 `stream_ticket`，不要把长期凭据放进 query 或 fragment。节点配对仍走 `/v1/nodes/redeem`。
- **WP-05 桌面产品化**：Windows 控制器只通过 `createWindowsSecureBox`（Electron `safeStorage` / DPAPI）和 `FailClosedSecretStore` 保存 refresh。安全存储不可用时抛出 `secure_storage_unavailable`，禁止明文回退。退出、换服务器和恢复走 `logoutLocal`、`buildControllerRequest`、`restoreAfterRestart`。换服务器时请求体不得携带旧服务器的 refresh 或 Workspace token。
- **WP-06 移动基础**：Android 使用 `ControllerKeystoreStore`（Android Keystore，AES/GCM）。Keystore 不可用时抛出异常并且不写 SharedPreferences 或文件。登录接口与桌面相同，配对码不能当成手机登录。
- **WP-07 移动核心**：消息、文件、审批和设备管理各自带控制器 access token 调用 `POST /v1/identity/authorize`，`action` 使用合同里的 scope。单设备撤销后的下一次调用返回 `revoked`。不要靠删除 Connector 节点来登出手机。

## 尚未在本环境执行

Windows DPAPI 和 Android Keystore 的真机验收没有在此环境运行。生产库迁移 `085` 也没有执行。
