# 出站与默认行为清单

基线 `c82873aad`，2026-10-24 静态源码检查。下面的“当前行为”是源码事实；没有抓包或证明连接已发生。允许范围只适用于本轮测试，未授权修改生产防火墙。

| 入口 | 当前默认/触发路径 | 时期与必要性 | 独立产品处理 / 责任 |
| --- | --- | --- | --- |
| Launcher `src/main/auth/endpoints.ts` | Workspace API、登录、account 分别回退 `workspace-endpoint.openagents.org`、`openagents.org`、`endpoint.openagents.org` | 运行/登录；当前正常入口 | T01 统一自有配置，缺失时进入配置；T03 自有身份 |
| Launcher `src/main/index.ts`、`mirror.ts` | 查询官方 npm 包 latest、下载核心；镜像失败回退 npm 官方源 | 首启/核心升级，仍是运行依赖 | T02 固定自有核心、清单/哈希与失败关闭；本地 file dependency 不足以证明运行独立 |
| Launcher `package.json`、`src/main/updater.ts`、`mirror.ts` | `dl.openagents.org/launcher/stable` 与官方下载/发行链接 | 运行升级；可选但当前存在 | T01/T09 关闭旧更新源，T11 核查发行身份 |
| Launcher `src/main/bootstrap/node-runtime.ts`、`mirror.ts` | nodejs.org 与 npmmirror/阿里/华为；npmjs/npmmirror/腾讯 npm 镜像 | 首启 Node/npm 安装；缺运行时时必需 | T02 确定允许来源、固定版本/完整性；“镜像”仍是外部服务 |
| Connector `src/adapters/base.js`、`src/daemon.js`、`src/cli.js` | 无 endpoint 时回退官方 Workspace API，CLI 另构造官方网页 URL | 运行、daemon、CLI | T01 所有入口共享配置且禁止静默回退 |
| Connector `src/registry.js` | 官方 Workspace agent-registry，存在本地/缓存目录逻辑 | 运行目录查询 | T01/T02 改自有/随包目录，核验离线失败路径 |
| Connector `src/update-check.js`、`bin/agent-connector.js` | 查询 `@openagents-org/agent-launcher` npm 最新版及更新提示 | CLI 启动/更新 | T02 覆盖 CLI，不能只修桌面更新 |
| `scripts/install.sh` / `install.ps1` | 下载官方命名核心包、Node、npm 及镜像回退 | 安装/运行准备 | T02 固定自有安装包及依赖来源 |
| frontend `lib/api.ts`、`lib/account-api.ts` | 公共 API 缺配置回退官方；重发认证邮件另用官方 account | 构建注入 + 运行 | T01/T03；Android Host 与 Web 共用业务 API，T07 路线先核验 |
| frontend `lib/firebase.ts`、auth context | Firebase SDK 登录路径 | 可选身份，但旧登录可能依赖 | T03 独立身份不依赖官方 Firebase 项目；本轮无 Firebase 请求 |
| frontend `vite.config.ts` | desktop 构建将 PostHog/GA 设为 undefined | 构建/遥测可选 | 保留禁用；Web、Launcher renderer 要另查，不能外推全端关闭 |
| backend `app/config.py`、`services/analytics.py` | 通用 config 默认启用 PostHog 并有官方租户配置；自托管 Compose 显式关闭 | 运行遥测；非必需 | 独立配置默认关闭，T01/T03 复核日志/错误脱敏 |
| backend config/Firebase/Apple、`routers/auth.py` | Firebase Identity Toolkit / Google 证书、Apple JWKS；account 查询默认官方 endpoint | 可选身份/旧账号路径 | T03 自有身份；仅用户显式选用自有项目时另列允许范围 |
| backend Yumi/campaign/router/cloud providers | 默认 Yumi/gateway/account/OAuth 回调含官方域名；部分功能按开关/密钥启用 | 可选模型、活动、OAuth | 测试全关；模型供应商须单独明确允许，不能把网关当自有服务 |
| backend S3、Resend、FCM、Redis、浏览器/隧道 | 按配置触发，存在第三方服务依赖 | 可选存储/邮件/推送/缓存/浏览器 | 本轮 local storage、无邮件/推送/浏览器/隧道；T10 观察子进程失败连接 |
| workflows `agent-hub-upstream-sync.yml` | schedule、fetch upstream、push tags、创建 PR | 开发治理 | T11 停止自动同步/标签传播并核验真实仓库设置；本轮未改云端工作流 |
| workflows `desktop-build.yml`、`agent-connector.yml`、`agent-mirror.yml`、E2E | 官方发行/镜像目标；E2E 指向官方 Workspace API | 构建/发行/测试 | T11 逐项改自有目标；存在源码不等同当前启用 |

本轮运行允许：单机回环 HTTP 测试服务、内存 SQLite、G 盘合成文件。未调用外部模型/官方账号。当天较早的句子曾写“没有进行这些下载”。随后的安装和镜像构建实际使用了 pypi.org、registry.npmjs.org、`registry.npmmirror.com` 上的 `qrcode.react@4.2.0`，以及本机 `daemon.json` 已有的镜像源；没有改用户 npm、Docker 或安全设置，也未批准任意新的第三方代理。最终以 T10 分 Windows、Android、服务端和子进程的网络证据补全此表。

## 本地开发合同（2026-10-24 决定，源码仍待 T01）

上表的“当前默认”仍是源码里的官方回退，不是已经改完的运行行为。所有者授权的本地合同是：apiBase/authBase `http://127.0.0.1:18000`，webBase `http://127.0.0.1:13000`；仅明确开发模式允许这些本机 HTTP。正式远端必须是用户显式配置的 HTTPS。缺少必需地址时为 `configuration_required`，不猜测域名，不回退官方。registry/update 默认关闭，目录优先随包本地数据。隔离测试栈已经按上述回环端口发布；生产与 preview 未启动。T01 负责把各端默认行为改到这份合同，不能只改 Workspace URL。

## 工作流源码盘点（2026-10-24）

下表只读 `.github/workflows/`，记录文件和触发器写法。2026-10-24 的仓库启用状态记在后面的未认证 API 表。T11 仍负责停用上游同步。

| 文件 | 源码中的触发 | 源码中的官方或发布目标 |
| --- | --- | --- |
| `agent-hub-upstream-sync.yml` | 每天 04:23 UTC，加手动 | fetch `openagents-org/openagents` develop 与 tags，推送审查分支并建 PR；仓库条件为 `zaiyemeiyou404/agent-hub` |
| `agent-mirror.yml` | 每 6 小时，加手动 | `mirror.openagents.org` |
| `launcher-agent-e2e.yml` | 每天 07:17 UTC，加手动 | `workspace-endpoint.openagents.org` |
| `agent-e2e-smoke.yml` | develop 路径推送、PR 路径、手动 | `workspace-endpoint.openagents.org` |
| `desktop-build.yml` | `launcher-v*` / `desktop-v*` 标签，加手动 | `dl.openagents.org`；Windows 签名输入默认关闭，并指向 SignPath |
| `agent-connector.yml` | main/master/develop 的路径推送与 PR | 发布目标未在触发段写官方域名；包名仍是上游 scope |
| `agent-hub-images.yml` | 路径推送、手动 | GHCR 镜像；前端 API 地址由手动输入或仓库变量提供 |
| `agent-hub-verify.yml` | develop 路径推送、PR、手动 | 解析自托管 Compose，不指向官方 Workspace API |
| `deploy-digitalocean.yml` | `release` 推送、手动 | 注释写明 release 还触发 DigitalOcean 与 Vercel；本轮未查云端项目 |
| `promote-release.yml` | 仅手动 | fast-forward `develop` 到 `release`，使用专用 deploy key |
| `release-sync-check.yml` | develop/release 推送 | 检查 release 是否为 develop 祖先 |
| `pytest.yml` | 仅手动 | Ubuntu 上的 Python 测试，不是本机续验 |
| `workspace-desktop-bundle.yml` | 前端/Launcher 路径 PR，加手动 | 构建桌面包，不证明已发布 |
| `check-commits.yml` | main/master/develop 的 PR | 拒绝 Co-Authored-By，无官方服务调用 |
| `issue-triage.yml` | issue opened/edited | 使用仓库 issue 权限，无官方 Workspace 调用 |

## GitHub 启用状态（2026-10-24 未认证 API）

`GET /repos/zaiyemeiyou404/agent-hub` 200：公开，默认分支 `develop`，`pushed_at` 2026-10-23T09:24:05Z。`GET .../actions/workflows` 200，`total_count` 15。`GET .../actions/permissions` 401。最新上游同步 job logs 403。本机没有 `gh`，请求未带 token。没有停用 workflow。

| Workflow | API `state` | 近期运行 |
| --- | --- | --- |
| `agent-hub-images.yml` | active | push 成功：2026-10-22 `feat/zai-7-self-hosted-identity`，2026-10-20 `feat/secure-local-file-requests` |
| `agent-hub-upstream-sync.yml` | active | schedule 失败：run 39400968631、39576725788、39755579296、39931559713（2026-10-20 至 2026-10-23）。job 120340808790 失败步骤是 “Merge upstream into a review branch, preserving history”。2026-10-19 的 workflow_dispatch 成功 |
| `agent-hub-verify.yml` | active | 2026-10-19 `feat/ghcr-prebuilt-images` 的 pull_request 成功 |
| 其余 12 个 workflow 文件 | disabled_manually | 含 mirror、Launcher E2E、desktop-build、DigitalOcean deploy、pytest、promote-release。禁用是仓库状态，不表示源码里的 schedule 或发布目标已删除 |
