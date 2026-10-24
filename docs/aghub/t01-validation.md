# T01 复核修复回执

日期 2026-10-24。分支 `codex/zai-16-independent-endpoints`。本文件记录对 `4eb6b31a06a5f70652575ab4d608d46b7555497f` 的源码复核修复，不是 T00 或 T01 的完成签署。T00 父提交仍是 `d6a34d5aac30edcecfc794b86727b12225a99e97`，人类复核未完成。没有 push，没有合并，没有改写历史。

## 本轮修掉的调用链

1. 无 `boundApiBase` 的旧会话在加载时清除，要求重新登录。`bearer`、`_renewSession` 和进行中的 `signIn` 固定发起时的服务身份；服务切换后拒绝旧结果，不把旧 bearer、refresh token 或 custom token 发给新服务。`_request` 仍先走 `bearer()`，因此会加载并刷新会话。
2. `firebase-rest.ts` 不再携带官方 Web API key，三个导出在任何请求前抛出 `configuration_required`。密码登录、session 失败和旧 Firebase 会话不再调用 Identity Toolkit 或 Secure Token。
3. `webBase()` 只读 web 配置。`AccountManager.signIn`、`WorkspaceHost` 和 IPC 不再把 API endpoint 传进 `webBase`。
4. 前端 `apiBaseFromEnv`、`webBaseFromEnv`、`authBaseFromEnv` 使用 `process.env.NEXT_PUBLIC_*` 的静态属性访问。缺配置时 `ServiceConfigurationGate` 渲染 `configuration_required`，`request()` 在 fetch 前拒绝。
5. Launcher 与 Connector 的 `acceptExplicitServiceUrl` 与 `resolveServiceUrl` 使用同一合同：远端只接受 HTTPS；HTTP 只接受显式 `AGHUB_DEV_LOOPBACK=1` 下的 `http://127.0.0.1:18000`（api/auth）和 `http://127.0.0.1:13000`（web）。带用户信息、路径、query、hash 的地址拒绝。`next.config.mjs` 的 `/wsapi` 重写使用同一判断，`AGHUB_DEV_LOOPBACK=1` 不再单独放过任意协议或主机。

## 实际执行

| 验证 | 结果 |
| --- | --- |
| Launcher vitest：account、account-isolation、account-captcha、endpoints、ipc、independence、workspace-host | 7 files，84 passed |
| Launcher `workspace-urls.test.ts` | 7 passed |
| Launcher `tsc -b` | exit 0 |
| Launcher `electron-vite build` | exit 0，产物在 `packages/launcher/out` |
| Frontend vitest：independent-endpoints、auth-redirects、share-origin、api-rewrite | 4 files，18 passed |
| Frontend `tsc --noEmit` | exit 0 |
| Backend pytest：`test_independent_config.py`、`test_analytics.py`、`test_workspace_session.py` | 60 passed，1 条既有 HMAC 密钥长度 warning。`DATABASE_URL=sqlite://`，文件目录在 `G:\CodexData\aghub-pytest-files` |
| Connector `node --test test/*.test.js` | 2130 tests，2044 pass，10 fail，76 skip |
| `aghub-t00-test` 只重建 frontend 与 backend | exit 0。db 容器保持 Running，卷 `aghub-t00-test_test_pgdata` 创建时间 `2026-10-24T08:19:51Z`，没有 `down -v` |
| 新镜像页面与健康检查 | frontend `sha256:1bc7a648b956958e2eb11d8530e1df75a49e7066ffa15a4f733bc9d2e9630c78`，backend `sha256:ac81eaabf4f5542ee6eb109a38356dd27bb90fb2335f792511f04d33404e70b4`，创建时间 `2026-10-24T10:47:23Z`。`/health` 200，`/ready` 200，`http://127.0.0.1:13000/` 200。19 个页面引用的 JS/CSS 全部 200 |
| 浏览器中的已配置页面 | `http://127.0.0.1:13000/` 渲染登录页，标题“登录 OpenAgents”。资源请求只有本机静态文件，没有 `/v1`、`googleapis` 或 `openagents.org` |
| 生产 bundle 中的静态环境 | 客户端 chunk 含 `o("http://127.0.0.1:18000","api"`、`o("http://127.0.0.1:18000","auth"`、`o("http://127.0.0.1:13000","web"`。chunk 中没有 `NEXT_PUBLIC_API_URL` 动态索引，也没有 `env[name]` |
| 缺配置的另一次生产构建 | 空的 `NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_WEB_BASE`、`NEXT_PUBLIC_AUTH_BASE`、`NEXT_PUBLIC_AGHUB_DEV_LOOPBACK`。浏览器打开后只见 `configuration_required` 和设置说明。performance 资源里没有 `/v1`、`googleapis`、`securetoken` 或 `openagents.org`。该临时容器和镜像已删除，没有占用 13000/18000 |

宿主上的 `next build` 因 Google 字体下载失败没有作为证据。上面的两个结论来自 Docker 内完成的生产构建和浏览器里打开的页面。

## Connector 剩余 10 项

同一 Node 在 `d6a34d5aac30edcecfc794b86727b12225a99e97` 的隔离副本 `G:\CodexData\aghub-t00-parent` 上运行 `mini.test.js`、`opencode.test.js`、`paths.test.js`、`probe.test.js`、`skill-installer.test.js`：189 tests，178 pass，10 fail。失败名称和断言与当前分支的全量剩余失败一致，因此记为既有环境问题，不是这次 endpoint 合同改动引入的回归。

| 用例 | 当前与父提交的共同现象 |
| --- | --- |
| `mini.test.js` `_stopProcess signals the process (group) with SIGTERM` | 断言“should send SIGTERM”为 false |
| `opencode.test.js` `credential_missing when nothing present` | 得到 `true == false` |
| `opencode.test.js` 自定义 endpoint / 自配置 provider | credential 为 `present`，期望 `unknown` |
| `paths.test.js` `getEnhancedEnv returns object with PATH` | `env.PATH` 在 Windows 上为空 |
| `probe.test.js` 四项 CLI/endpoint 判定 | Claude CLI 不存在，结果是 `not_installed`，不是 stdout 成功、`out_of_credit` 或 `timeout` |
| `skill-installer.test.js` injected cat path | `spawnSync cat ENOENT` |

这 10 项没有在本轮改产品行为。全量套件里原先会因宽松 URL 夹具失败的入口，已改为 HTTPS 夹具，或在显式 `AGHUB_DEV_LOOPBACK=1` 下使用 `http://127.0.0.1:18000`。

## 仍未关闭

- T00 与 T01 都保持 In Progress。本文不是人类 B/C 复核签字。
- 测试库仍是空 schema。没有 Alembic，没有生产或 preview 部署。
- 没有生成签名密钥，没有商店注册，应用标识没有改成 `com.zaiyemeiyou.aghub`。
- 原仓库 `G:\projects\aghub` 与 Android 产物未修改。
- 后端 `EMAIL_FROM` 默认值、SDK `DEFAULT_ENDPOINT`、营销和 e2e 脚本里的历史官方地址不在这次复核的六项里，不能据此声称所有官方字符串已经消失。
