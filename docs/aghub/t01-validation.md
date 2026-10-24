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

## 2026-10-24 Codex 二次复核与修复

对 `2007f091efcb05f0a95086788bf6135aba6ffc98` 独立复核后，发现并修复两处 P1：

- 桌面 Vite 构建未映射新增配置环境字段，页面导入 `service-endpoints.ts` 时触发 `ReferenceError: process is not defined`。现在 API/Web/Auth/开发开关均由主进程经预加载桥显式传递，Vite 不依赖页面中的 Node `process`；HTML 官方默认地址已移除，桌面也使用配置门禁。
- 共享前端持久会话没有签发服务元数据，修改同一 Web origin 的 API 配置后会把旧 token 发往新 API。现在保存/恢复和桌面初始/实时会话都验证 `apiBase`；无来源或跨服务旧会话要求重新登录。同一服务的正常会话与刷新仍可用。此元数据不改变后端 JWT 或 schema。

先增加两个回归文件，修复前 9 个用例中 8 个失败，分别复现浏览器构建异常、旧会话跨服务复用、来源缺失及缺配置仍发 handoff 请求。修复后，以下为本次 Codex 实际执行结果：

| 检查 | 结果 |
| --- | --- |
| 前端会话恢复/请求、实际 Vite 配置生成的无 `process` 浏览器产物、端点/重写/分享/刷新和桌面路由 | 8 files，35 passed |
| Launcher 原认证/隔离、Host/IPC 与新增预加载桥初始及实时会话用例 | 8 files，89 passed |
| Frontend `tsc --noEmit --incremental false` | exit 0 |
| Launcher `tsc -b` | exit 0 |
| 完整共享页面 `vite build` | exit 0，4933 modules，15.92 秒；产物 `workspace/frontend/dist-desktop` |
| `check-workspace-bundle.mjs` | 通过 |
| Launcher `electron-vite build` | main、preload、renderer 均 exit 0，预加载桥包含新配置/会话来源合同 |

合计 124 个相关定向用例通过。前端刷新用例显式配置合成 API；缺 Web/Auth 配置的负向用例保留空配置，未靠改变产品默认值使测试通过。日志/缓存目录为 `G:\codex日常\tmp\aghub-fix-2007f09`、`G:\codex日常\tmp\aghub-review-2007f09`。复核复现为 mock HTTP，桌面配置产物在没有 Node 全局变量的隔离浏览器上下文中执行，不涉及真实身份。

本轮没有重跑无改动的 Connector 全量套件或后端，没有重建 Next 服务镜像，没有运行 Windows 安装包或交互式 Electron 真机验收。没有迁移、推送、合并或部署；T00/T01 的人审与整产品门禁仍保持原限制。


## 2026-10-24：补齐独立复核发现的设置流程与安装入口

本轮父提交为 `915a1e8f052ada7047c6636ad6e6fa4590f0f91a`，对应
Linear ZAI-16 独立复验中“缺配置只能看到提示，没有可操作设置”及上游安装链接的问题。

### 实现

- 首次启动显示 API/Web/Auth 三个 origin 输入、显式本机开发开关、保存与错误反馈；
  已配置后仍可从“服务设置”进入编辑和取消。网页保存非敏感 origins 后重载，
  清除旧工作区会话及可选浏览器身份；没有 Firebase 项目的独立模式也可保存。
- 桌面通过 `workspace-view:configure-services` 保存，main 只接受当前随包页面，
  重新校验 URL，并原子保存三个地址与 Connector endpoint。磁盘写入失败时不改变
  活动配置、不退出旧会话；成功后清除旧会话、等待页面存储清理再打开本地首页。
  保存值及显式开发开关可在重启后恢复。没有修改操作系统环境变量或网络安全设置。
- 首页 GitHub 指向自有仓库；移除上游 Discord/Twitter。首页、配对面板与聊天空状态
  的安装命令统一指向候选源码，未发布的桌面安装包改为明确的源码构建说明，
  不再生成 `/download/launcher/*` 或复制未实现的自动安装脚本。
  公开 `SKILL.md` 移除上游地址与安装命令，要求显式自有 API。
- 新增 [install-candidate.md](install-candidate.md)。它仅说明候选源码构建，
  不将未发布的安装包当作可用下载。

### 实际验证

| 检查 | 结果 |
| --- | --- |
| Frontend `node node_modules/vitest/vitest.mjs run` | **111 files / 529 passed**，无未处理错误 |
| Launcher `node node_modules/vitest/vitest.mjs run` | **95 files / 956 passed / 12 skipped** |
| Frontend `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` | exit 0 |
| Launcher `node node_modules/typescript/bin/tsc -b --pretty false` | exit 0 |
| 共享桌面 `node node_modules/vite/bin/vite.js build` | exit 0；有既有大 chunk 提示 |
| `node scripts/check-workspace-bundle.mjs`、Launcher `electron-vite build` | exit 0，main/preload/renderer 均构建成功 |
| 网页 `NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build --webpack` | exit 0 |
| 刚构建网页在新端口 `127.0.0.1:13112` 的 `/`、实际 JS 资源、`/SKILL.md` | 均 HTTP 200；初始 SSR 配置门禁、源码指南可见，无上游 install.sh 命令 |

新增表单用例先在旧提示页面失败，保存 IPC 用例先在旧主进程缺失 handler 时失败。
额外身份清理用例也先复现旧浏览器身份未清除，再通过修复。
首次全量检查发现 11 个前端失败和 2 个桌面失败：在父提交导出的独立副本中
复现其中 **8 个既有前端失败**（API 重试夹具没有显式 API、artifact 夹具没有
显式 Web）。另 3 个是本轮新增读取存储对旧的局部 window 测试模拟的影响，
已使用可选存储读取修正。桌面旧 PATH 测试使用固定 `:`，改用平台
`path.delimiter`。只调整测试夹具，不恢复产品默认地址。最终全量结果如上。

### Windows 实际配置交互

使用本机既有 Electron、新构建 preload 与完整 `dist-desktop`，加载本轮真实的
`registerAccountIpc`、`WorkspaceHost`、`Store` 和 workspace bundle protocol。
专用测试宿主不启动 Agent core/daemon、不调用数据库，独立 userData、缓存和日志
全部在 `G:\codex日常\tmp\aghub-t01-settings`；所有 HTTP(S) 出站被测试宿主拦截。
Windows computer-use 实际填写与点击观察到：

1. 空设置首次显示三个可填写的 origin 和保存按钮。
2. `http://api.settings.test` 与另两个 HTTPS origin 被拒绝，显示可操作错误；
   尚未创建 settings.json。
3. 改成 `https://api.settings.test` 后保存成功，settings.json 同时含三个 origin 和
   workspaceEndpoint；旧页面被销毁并重新进入有“服务设置”入口的登录首页。
4. 重新打开设置，三个值正确回填。关闭测试窗口后重新启动，仍进入已配置的登录
   首页，配置文件保持相同三个来源。此过程没有 HTTP(S) 出站记录。

这证明本轮真实配置桥和候选共享页面的交互，不冒充完整 Launcher 启动、安装包、
签名或线上账号验收。初次隐藏测试窗口未能用于操作，最终在单一可见测试窗口
完成上述验证。测试宿主与原始日志未上传；可复核源码及自动测试均在仓库。

### 仍需后续验收

本轮修补针对上述两项产品缺口；T01 继续 **In Review**。
未重建 Docker Next 镜像、未制作或安装发行包、未验证真实账号/配对或 Android 真机，
没有迁移、合并、部署或签署。浏览器设置流程由 DOM 自动测试与最新 Next 构建/HTTP
验证覆盖；本次实际 Windows UI 操作针对 Electron 共享页面。Connector/后端本轮
未改，未重复执行其全量套件，历史失败与限制仍保留。独立复审确认后再判断完成。

脱敏日志与基线副本：`G:\codex日常\tmp\aghub-t01-settings`。


## 2026-10-24：修复独立复验指出的 npm link 安装阻塞

父提交：`36eb06aea96b0e7176c082e70dae973254922aeb`。
Linear 新复核已确认配置表单阻塞解除，本轮针对新发现的源码安装指南错误。

### 根因与复现

原命令从仓库根目录运行 `npm link --prefix packages/agent-connector`。
这里 `--prefix` 不只选择本地包，也覆盖 npm 的全局目的地。npm link 可以返回
exit 0，却将包链接回源码树，没有向原先配置的隔离全局目录安装可用的 `agn`。
因此只检查 link 的退出码不够，还必须核对真实命令路径并运行 CLI。

本机 Windows Node 24.14.0 / npm 11.9.0 在父提交导出的新源码副本中复现：

- 使用独立空 npm prefix、分开的空 user/global npmrc，缓存和临时文件在 G 盘。
- `npm --prefix packages/agent-connector ci` 从零安装 2 个锁定依赖。
- 原 link 命令 exit 0；隔离全局目录没有 `agn.cmd`。
- 实际 junction 在源码 `packages/agent-connector/node_modules/@openagents-org/agent-launcher`，
  指回同一源码目录。没有对工作树或用户实际全局目录安装别名。

### 修正

指南与 `workspace/frontend/lib/installation.ts` 的复制内容同步改为：

```text
npm --prefix packages/agent-connector ci
cd packages/agent-connector
npm link
cd ../..
agn --help
```

npm link 在包目录运行，保留使用者已经配置的全局 prefix。
补充了可写 prefix 与 PATH 前提：Windows 使用 prefix 根目录，macOS/Linux 使用
prefix/bin。复制命令追加 `agn --help`，使安装后的实际可执行入口得到验证。
指南另提供仓库根目录的 `node packages/agent-connector/bin/agent-connector.js --help`
作为不依赖全局别名的用法，后续示例可用该前缀替换 `agn`。

### 修后实际验证

从真实页面常量打包提取命令，与指南第一个代码块逐字比较一致；只跳过 git clone
及进入已准备好的仓库目录两步，余下命令原样执行。没有用另一组手写命令冒充复制流程。
测试开始时源码副本无 node_modules，全局 prefix 为空；未使用本机既有 `agn`。
依赖从第一次干净 npm ci 填充的独立缓存再次安装，新流程验证开启 npm offline。

| 环境 | 实测结果 |
| --- | --- |
| Windows Node 24.14.0 / npm 11.9.0，PowerShell，另一份新源码副本和空 prefix | ci 成功；复制块成功；agn.cmd 解析到该 prefix，global package junction 指向该源码副本；agn --help exit 0 |
| Linux Node 20.20.2 / npm 10.8.2，本项目既有测试镜像 | 同一复制块 exit 0；command -v agn 为独立 prefix/bin/agn；readlink -f 指向该新源码；agn --help exit 0 |
| Windows / Linux 本地 Node CLI 备用入口 | --help 均 exit 0 |
| 实际页面复制文本与指南 | 完全一致 |

Linux 使用任务专用一次性容器 `aghub-t01-install-cli`，network none、只读根目录，
只绑定 G 盘新源码、独立 prefix、缓存和临时目录，结束自动移除。没有重建镜像、
修改既有容器、启动服务/数据库，或改变主机 npm 全局配置。
证据目录：`G:\codex日常\tmp\aghub-install-link-check`，含原失败记录、实际复制命令、
Windows 新流程结果和 Linux 完整输出；原始本地日志不上传。

本轮仅修改安装指南、共享复制常量及本验证记录，没有修改配置/认证运行逻辑。
本轮重新运行共享桌面 Vite 与 Next webpack 生产构建，均 exit 0；
两种新产物包含修正后的命令，旧的 link --prefix 命令不再出现在候选静态 JS 中。
本轮未重跑全量单元测试或 Launcher main/preload/renderer 构建；
此前 36eb06aea 的对应结果保留为历史证据。
T01 保持 In Review，等待新头部独立复审及适用安装/人工验收；未标 Done、迁移、
签名、合并、部署或变更生产/preview。
