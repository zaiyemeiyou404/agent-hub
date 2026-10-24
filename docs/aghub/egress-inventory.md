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

本轮运行允许：单机回环 HTTP 测试服务、内存 SQLite、G 盘合成文件。未调用外部模型/官方账号。依赖安装、容器构建将需要单独列明 npm/PyPI、镜像仓库、GitHub Actions、Node/JDK/Android SDK/Gradle Maven 等来源；本轮没有进行这些下载，也未批准任意第三方代理。最终以 T10 分 Windows、Android、服务端和子进程的网络证据补全此表。
