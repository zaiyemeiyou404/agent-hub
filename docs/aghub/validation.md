# T00 测试与交接回执

日期 2026-10-24；源码基线 c82873aad；分支 codex/zai-15-implementation-baseline。

## 实际执行

| 验证 | 实际结果 | 范围限制 |
| --- | --- | --- |
| 原环境下 Connector 选集 | 77 passed / 17 failed / 1 skipped | 沙箱回环 EACCES、临时文件操作 EPERM、宿主认证状态干扰；不是产品故障归因 |
| 清理环境后的 Connector 同一选集 | **94 passed / 0 failed / 1 skipped** | Node 24.14.0，合成 HOME；OpenCode wrapper 探测用例按 Windows 平台跳过，junction 测试通过；运行时 CLI/模型是测试替身 |
| Backend 首次合成配置 | 153 passed / 1 failed | session exchange 测试 mock HTTP，但依赖非空 Firebase key；空配置导致提前返回，没有真实联网 |
| Backend 修正测试夹具后同一选集 | **154 passed / 0 failed**，1 warning | 使用合成 key，不是官方 key；warning 来自既有合成 HMAC 夹具密钥长度；内存 SQLite，不是 PostgreSQL/迁移验收 |
| 两个新 Node 脚本语法检查 | 通过 | `node --check` |
| 独立 Compose 解析 | 通过，exit 0 | 一次性随机合成密码 + `config --quiet`；没有启动容器/建库/迁移 |
| 版本/锁文件输入快照 | 已生成并保存 SHA-256 | 不证明完整 npm ci、二进制签名或发行可复现 |

复跑入口：

```powershell
node scripts/aghub-test-baseline.cjs --output-dir 'G:\codex日常\tmp\aghub-t00-isolated-final' --backend-python 'G:\CodexData\aghub-pytest\Scripts\python.exe'
node --check scripts/aghub-test-baseline.cjs
node --check scripts/aghub-baseline-snapshot.cjs
```

测试入口只保留系统执行变量和合成配置，PATH 不含宿主 Agent 安装路径。现有 Python 环境复用但未安装/升级依赖。日志、隔离 home、临时快照和 results.json 在指定 G 盘目录；运行器不会把它们提交。重复验收应另给新的 output-dir，保留原证据。

Connector 选集为 agent-identity-header、local-file-transfer、local-file-command、approval-tools、codex、opencode 六个 test 文件。Backend 选集为 test_workspaces、test_local_file_requests、test_node_tokens、test_workspace_session 四个 test 文件。既有用例负责行为校验，本轮没有新增仅复述实现的单测。

配置解析复验在独立 PowerShell 进程中给 AGHUB_TEST_DB_PASSWORD 注入一次性随机十六进制值，然后执行 `docker compose -f workspace/docker-compose.aghub-test.yml config --quiet`；结束即清除进程变量。不要输出完整 `config` 或复用正式密码。

## 当前交付与未验收项

本轮交付：实施基线、输入哈希、出站去留表、资产/声明登记、模块和写入边界、隔离测试配置及复跑入口；修订历史计划中暂停 Linear 的声明。应用业务代码和现有迁移文件未改。

未执行：production constraints 环境安装、完整前端/Launcher 构建、Linux CI、隔离 PostgreSQL 集成、GitHub 实际权限/工作流启用状态核查、应用标识外部冲突检查、自有签名发行、Android 真机、双执行设备/手机外网、真实 Codex/OpenCode 工具审批、网络抓包、恢复/升级和性能测试。

T00 的离线准备已可复验；任务保持 **In Progress**，等待以下适用环境证据和复核签署。出站清单里的地址边界可供后续增量准备，但不能把 T00 验收条件未满足写成下游任务已经解锁。T07 必须先核验原目录未跟踪的 Android 源码/产物来源。不存在“所有任务已完成”或“客户端可正式发行”的结论。

## 2026-10-24 续验

工作树已回到 `codex/zai-15-implementation-baseline`，HEAD 仍是 `af1dbf5139b35d09ee677b37aeaf4d95ee2f939a`。`codex/zai-16-independent-endpoints` 保留在同一提交，没有业务差异。原仓库仍为 `codex/zai-8-conservative-file-classification`，未跟踪的 `apps/` 与 `workspace/frontend/dist-android/` 未读取、未纳入。

| 验证 | 实际结果 | 范围限制 |
| --- | --- | --- |
| 同一离线入口复跑 | Connector **94 passed / 0 failed / 1 skipped**；Backend **154 passed / 1 warning** | 新证据目录 `G:\codex日常\tmp\aghub-t00-recheck-20261024`；Node 与合成 HOME；Python 仍是 `G:\CodexData\aghub-pytest` 的 3.12.15，FastAPI 0.159.1 / SQLAlchemy 2.0.55 / httpx 0.28.1 / pytest 9.1.1 |
| 两个 Node 脚本语法 | `node --check` 均 exit 0 | 不运行安装或迁移 |
| 11 个基线输入 SHA-256 | 续验当时与旧快照一致。收尾时已重写快照 | 旧快照的 `sourceCommit` 是 `c82873aad`，Launcher lock 哈希是 `a931f534…`。新快照生成时 HEAD 是 `af1dbf5139b35d09ee677b37aeaf4d95ee2f939a`，lock 在工作区未提交，哈希是 `6d779642…`，`connectorTargetPresent` 为 true。旧快照不是当前候选 |
| 独立 Compose 解析 | exit 0 | 新的一次性随机密码，只执行 `config --quiet`；未打印渲染结果，未启动容器、建库或迁移 |
| 前端许可证文件级检查 | `workspace/frontend/package.json` 无 `license`；目录无 LICENSE；`*.ts`/`*.tsx`/`*.js`/`*.md` 无 SPDX 或 Copyright 头 | 根 `LICENSE` 仍是 Apache-2.0。这不是法律结论，也没有改许可证 |
| Alembic 版本图 | 85 个版本文件，引用闭合，单一 head `084` | 只读文件；没有执行 `upgrade` |

## 2026-10-24 环境与构建

探测记录在 `G:\CodexData\aghub-t00-logs\env-probe-20261024.txt`。Docker 客户端 29.2.1 存在，`docker version` exit 1：`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`。WSL2 中 Ubuntu-22.04 与 docker-desktop 为 Stopped，Ubuntu 为 Running；两个发行版自带 Python 都是 3.10.12。Windows `py -0p` 默认 3.14，另有 uv 的 Windows CPython 3.12.15。本轮没有启动 Docker Desktop，也没有用 Windows 3.12 安装 production lock，因为 lock 含 Linux 专用 `uvloop==0.23.0`。

使用 Ubuntu 里已有的 uv 0.11.7，在 `/mnt/g/CodexData/aghub-t00-prodlock` 安装。uv 下载的是 CPython 3.12.13，不是本机 Windows 上的 3.12.15。第一次 `uv venv` 没有 pip，`python -m pip` 报 `No module named pip`，日志 `prodlock-install.log`。第二次 `uv venv --python 3.12 --seed --clear` 带上 pip 26.2.2，再执行与 CI 相同的 `python -m pip install -r workspace/backend/requirements.txt -c workspace/backend/requirements.production.lock pytest pytest-asyncio PyYAML`。来源是 pypi.org。中途有 SSL EOF 和一次 botocore 断点续传，最终 `PIP_EXIT=0`、`pip check` 为 `No broken requirements found`。导入结果：fastapi 0.143.0、sqlalchemy 2.0.54、httpx 0.28.1、uvloop 0.23.0、pydantic 2.14.0、pytest 9.1.1、yaml 6.0.3。freeze 与 lock 的 75 条全部同版本；多出的只是命令显式安装、lock 未钉住的 pytest 9.1.1、pytest-asyncio 1.4.0 及其 iniconfig、packaging、pluggy、Pygments。日志 `prodlock-install-2.log`、`prodlock-freeze.txt`。没有执行迁移或 schema 初始化。

前端在 `workspace/frontend` 用现有 lock 执行 `npm ci --no-audit --no-fund`，586 个包，exit 0。lock 里 708 个解析地址在 `registry.npmjs.org`，只有 `qrcode.react@4.2.0` 在 `registry.npmmirror.com`。这次安装继承了用户 npmrc 的 `registry=https://registry.npmjs.org/` 和 `strict-ssl=false`，没有改用户配置。随后 `node node_modules/typescript/bin/tsc --noEmit` exit 0。`npm run build:desktop` exit 0，vite 7.3.6，35.71 秒，产物在 gitignore 的 `dist-desktop/`。第一次 `npm run build` 因连不上 `https://fonts.googleapis.com` 失败；单独探测该 CSS 返回 200 后重试，Next.js 16.1.1 exit 0。没有读 `.env` 或 `.env.local`，这两个文件也不存在。没有执行 `next start`。

Launcher 的已提交 lock 不能直接 `npm ci`。npm 11.9.0 的调试日志写明 `../agent-connector` 被 `node_modules/@openagents-org/agent-launcher` 引用但 lock 中没有目标包体。npm 10.9.2 在同一位置抛出 `Cannot read properties of undefined (reading 'extraneous')`，外层仍显示缺少 lock 的 EUSAGE。当时没有改仓库 lock，也没有浮动升级。只在 `G:\CodexData\aghub-t00-logs\launcher-lock-ci-fixture.json` 补了链接目标的名称、版本 0.2.196 和 blessed/ws 范围，用 npm 10.9.2 安装后把原 lock 按 SHA-256 `a931f53450ef78ee5059dd22eef021b32b6e1df8cf3de6e0c7c70b48e8f67601` 还原。那次安装 668 个包，exit 0；Electron `dist/version` 为 42.3.3，`electron.exe` 231522816 字节。`electron` 的安装脚本读的是 `electron_config_cache`，因此设在 G: 的 `ELECTRON_CACHE` 仍为空。当时的 `npm run typecheck`、`node ./scripts/check-workspace-bundle.mjs`、`npx electron-vite build` 都是 exit 0，但用的是临时补丁 lock，不能当作仓库 lock 已修好。Connector 用自己的 lock `npm ci`，2 个包，exit 0；其中 ws 是 lock 内的 8.20.0，Launcher lock 里的 ws 是 8.21.0，两边都按各自 lock 安装。仓库 lock 的修复见下一节。

GitHub 只读结果在 `G:\CodexData\aghub-t00-logs\github-*.json`。未安装 `gh`，请求没有携带 token。`GET /repos/zaiyemeiyou404/agent-hub` 返回 200：公开仓库，默认分支 `develop`，`pushed_at` 2026-10-23T09:24:05Z。workflows 返回 200，共 15 个。`active` 的是 `agent-hub-images.yml`、`agent-hub-upstream-sync.yml`、`agent-hub-verify.yml`；其余 12 个为 `disabled_manually`。上游同步最近四次 schedule（2026-10-20 至 2026-10-23）结论为 failure；job `120340808790` 失败在 “Merge upstream into a review branch, preserving history”。该 job 的 logs 接口返回 403，actions permissions 返回 401 `Requires authentication`。这些状态是仓库设置，不是 workflow 源码触发器。本轮没有停用任何 workflow。

## 2026-10-24 本地修复

工作区 `entrypoint.sh` 仍是 18 处 CRLF，没有为构建临时改文件再还原。`production.Dockerfile` 和同样执行该脚本的 `backend.Dockerfile` 在 `chmod` 前执行 `sed -i 's/\r$//'`。仓库根 `.gitattributes` 只增加 `workspace/backend/entrypoint.sh text eol=lf`，没有 renormalize 其他文件。从该工作区构建的 `aghub-t00-backend:baseline` 镜像内脚本 CR 数为 0。容器日志为 `Application startup complete`，没有 `no such file or directory`。

测试网络原先是 `internal: true`。Compose 记下了 `127.0.0.1` 绑定，但运行时 `NetworkSettings.Ports` 为空，宿主连接被拒绝。已去掉 internal，保留 bridge，端口仍只写 `127.0.0.1`。重建时保留卷 `aghub-t00-test_test_pgdata`，数据库容器用原来的 `POSTGRES_PASSWORD` 重新挂到新网络；public 基表仍是 0。`netstat` 只有 `127.0.0.1:13000` 和 `127.0.0.1:18000` 在监听。宿主 `http://127.0.0.1:18000/health` 为 200 `{"status":"ok"}`，`/ready` 为 200 `{"status":"ok","database":"ok"}`。没有改 `daemon.json`、防火墙或安全设置，没有操作其他 Compose 项目，没有执行 Alembic。

前端镜像不再执行 `npm start`。`workspace/frontend/Dockerfile` 在构建后把 `public` 和 `.next/static` 复制进 standalone，`CMD` 为 `node .next/standalone/server.js`，`HOSTNAME=0.0.0.0`，`PORT=3000`。容器命令与日志一致，没有 standalone 警告。宿主 `http://127.0.0.1:13000/` 为 200，`text/html`，12027 字节。页面引用的 `/_next/static/chunks/27888b6ffcce4db7.css` 为 200，`text/css`，1996 字节；`/_next/static/chunks/turbopack-a80652eac005aadf.js` 为 200，`application/javascript`，10251 字节。日志 `frontend-standalone-build.log`，`FRONTEND_UP_EXIT=0`。

`packages/launcher/package-lock.json` 只补了缺失的 `../agent-connector` 包体：名称 `@openagents-org/agent-launcher`，版本 0.2.196，依赖范围仍是 `blessed ^0.1.81` 与 `ws ^8.18.0`，bin 与 engines 与 connector 的 `package.json` 相同。没有升级其他包。新目录 `G:\CodexData\aghub-t00-lock-ci` 复制了 launcher、agent-connector 和前端源码，不含 launcher 的 `node_modules`。该目录里的 lock 与仓库 lock SHA-256 同为 `6D77964281D64EE819D1AE610800A6EC546253FC886F49DF5B1CB28D510427BD`。本机 npm 11 执行 `npm ci --no-audit --no-fund`，668 个包，`CI_EXIT=0`，日志 `launcher-lock-ci.log`。`electron_config_cache` 为 `G:\CodexData\aghub-t00-electron-cache`。Electron `dist/version` 为 42.3.3，`electron.exe` 231522816 字节。前端组件的 `react` 等依赖来自工作区已有的 frontend `node_modules` 联接，不是另一次 lock 补丁。随后 `npm run typecheck` 与 `npx electron-vite build` 均为 exit 0。渲染构建产物包含 `out/renderer/assets/index-WYVJI84v.js`。没有运行 electron-builder、签名或发布。

## 仍未验收

以下各项有这次的实际边界，不能写成已通过，也不用后续整机验收否定上面的基线结果：

- 应用 schema 仍未初始化。迁移图仍是只读结论：85 个版本、head `084`。本轮明确不执行迁移；空库是本地限制。没有启动生产或 preview。
- `GET /repos/zaiyemeiyou404/agent-hub/actions/permissions` 为 401。发布、镜像和部署凭据是否存在，不能由公开 workflow 状态证明。
- 自用开发合同标识是 `com.zaiyemeiyou.aghub`。本地 tracked 源码只有 `com.openagents.launcher`，没有同名冲突。外部商店、证书注册没有查询，不宣称已获得注册资格。实际改名归 T02。
- 签名责任已归口用户 zaiyemeiyou404，材料约定放在仓库外 `G:\CodexData\aghub\signing`。当前没有生成私钥，也没有证书。正式远端 HTTPS 地址仍须用户显式配置，域名所有权未核实。
- 本文件的技术复核是 AI 复核，不是人类 B/C 签名。另一位开发者的合并/发行人审未完成，T00 保持 In Progress，没有标 Done。
- T07 Android 真机、T09 安装包/签名/升级、T10 抓包与第二台设备、T12 性能样本属于后续验收。它们未执行，不阻止本文件已经记录的离线基线、依赖安装和本地构建。

仍待仓库管理员或后续任务处理、且本轮没有代做的事项：以后若迁移 `aghub_t00_test`，按 `workspace/AGENTS.md` 另作说明；T11 是否停用仍为 active 的上游同步。Linear ZAI-15 仍为 In Progress，没有标 Done。
