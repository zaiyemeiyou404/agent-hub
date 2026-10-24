# T00 实施基线 — 2026-10-24

任务：[ZAI-15](https://linear.app/zaiyemeiyou/issue/ZAI-15/t00-a-锁定版本隔离环境与接口基线)。执行依据为 Linear 总计划 v3.7 / 清单 v1.2；先独立自用，Windows + Android 共同交付，后续再做稳定化。此回执不代表 I01–I16 或真机验收已通过。

## 源码与现有工作

- 实际基线 `c82873aadffffb17a2cb036b194917f40323f1ef`，已包含原计划 `d32e46c8011dbc6d04735cb612b84ec498943041` 之后的本地文件请求与当前 Connector 绑定改动。沿用该实现，不退回旧基线另写协议。
- 原仓库 `G:\projects\aghub`、分支 `codex/zai-8-conservative-file-classification`。开工时 tracked 文件干净，存在未跟踪的 `apps/`、`workspace/frontend/dist-android/`；已保留，没有纳入本轮提交。
- 实施工作树 `G:\codex日常\worktrees\aghub-zai15`，分支 `codex/zai-15-implementation-baseline`，从同一 commit 创建。未复制原目录中的账户、环境文件或构建缓存。
- 已读全局存储规则、`G:\projects\AGENTS.md`、`workspace/AGENTS.md`、`AGENT_HUB.md`。preview 共用生产库和文件，不能作为隔离测试环境。实际数据库迁移必须另行说明并协调，本轮没有执行迁移或启动部署。
- Linear `get_agent_context` 返回工具不存在，未取得共享 field notes；以源码及当前计划核验，不把此错误当作“没有历史记录”。

## 版本事实

| 组件 | 本轮读到的版本 / 来源 | 状态 |
| --- | --- | --- |
| Launcher | `openagents` 1.1.1，MIT | 仍为上游应用标识与发布配置 |
| Connector | `@openagents-org/agent-launcher` 0.2.196，MIT | Launcher package 与 lock 均为 `file:../agent-connector` 链接；旧文档的 0.2.194 / 0.2.189 漂移不能直接沿用 |
| Workspace frontend | `openagents-workspace` 0.1.0 | package 未声明 license，需补查组件来源 |
| Python 根包 | `openagents` 0.9.3.post20，Apache-2.0 | 不等同 Workspace 服务版本 |
| SDK Studio | 1.0.7，MIT | 自用最小发行包外的候选可选组件 |
| Backend | 随 commit 标识；Dockerfile Python 3.12 | 依赖输入与 production constraints 的 SHA-256 见快照 |
| 本机测试 | Windows 11 x64；Node 24.14.0；Python venv 3.12.15 | CI 原配置为 Ubuntu / Node 22 / Python 3.12，尚未在该环境复跑 |
| 可用本机 CLI | Codex 0.144.6；OpenCode 1.19.3；Claude Code 2.1.92 | 仅验证版本命令；没有调用付费模型、派发真实项目任务或证明工具审批可用 |
| OpenCode 适配器 | 测试支持段 1.17.x，新版本会判 degraded | 本机 1.19.3 的真实执行/审批能力交 T04a，不能凭安装成功验收 |
| Docker Compose | 5.1.0 | 仅用于配置解析，未运行容器 |

机器生成的 [baseline-snapshot.json](baseline-snapshot.json) 保留输入文件哈希。更新基线时运行 `node scripts/aghub-baseline-snapshot.cjs` 并审查差异；哈希是完整性记录，不是可信签名。

## 隔离入口与依赖

`node scripts/aghub-test-baseline.cjs --output-dir <G盘证据目录> --backend-python <现有Python环境/python.exe>` 运行现有测试。入口使用白名单环境变量、合成 HOME/APPDATA/XDG/TEMP、空模型凭据、内存 SQLite、独立文件目录；禁用后台任务和遥测，不读取真实账号配置。session exchange 的测试用假 Firebase key，HTTP 由既有测试 mock。此脚本不是网络防火墙。

本轮复用了 `G:\CodexData\aghub-pytest\Scripts\python.exe`，没有改动该环境。其 FastAPI 0.159.1 / SQLAlchemy 2.0.55 / httpx 0.28.1 / pytest 9.1.1 与 production constraints 的 FastAPI 0.143.0 / SQLAlchemy 2.0.54 不同；本轮结果不是 production lock 环境验收。

后端可复现安装命令仍采用既有 CI：`python -m pip install -r workspace/backend/requirements.txt -c workspace/backend/requirements.production.lock pytest pytest-asyncio PyYAML`。需在独立 Linux/Python 3.12 环境执行；本轮未运行安装或批量升级。constraints 含 Linux 专用 uvloop，不能把 Windows 安装失败当成产品回归。

集成环境单独使用 `workspace/docker-compose.aghub-test.yml`，不得与 production/preview Compose 合并。其项目名 `aghub-t00-test`，数据库 `aghub_t00_test` / 用户 `aghub_test`，专用命名卷、internal 网络、回环端口 13000/18000；要求独立随机 `AGHUB_TEST_DB_PASSWORD`，没有 host env_file、外部卷、生产 bind mount 或自动迁移服务。密码只在本地进程/受保护环境中生成，不提交。内部网络限制容器运行时出站，不能限制浏览器、构建下载或宿主 CLI。

本轮只以一次性合成密码运行 `docker compose -f workspace/docker-compose.aghub-test.yml config --quiet`；不输出渲染后的连接串。尚未建库、建立 schema、构建镜像或证明 ready 可用。后续集成测试需先说明 schema 初始化范围，完成必要协调，再对该独立数据库操作；不能直接照搬生产 `up` 的自动 migrate 路径。

## 容量与性能合同

| 范围 | 本轮配置 / 边界 | 后续责任 |
| --- | --- | --- |
| PostgreSQL | 测试 512 MiB / 1 CPU / 128 PID；无宿主发布端口 | T12 测量连接、内存、磁盘占用 |
| Backend | 测试 1 GiB / 2 CPU / 256 PID；1 worker，连接池 5+0、线程 5 | T05/T06 做任务/目录并发及资源拒绝 |
| Frontend | 运行时测试 1 GiB / 2 CPU / 256 PID | 构建峰值另测，运行限额不约束构建 |
| 本地文件 | 当前代码 50 MiB、15 分钟请求 TTL、`local_file_request.v1` | T06 验证解码前限制、快照/磁盘配额与清理；尚无卷磁盘硬配额 |
| 任务/流量 | 本轮只单个测试进程；不并发真实任务 | T05 明确队列、超时与同目录串行；T08 记录样本；T12 做弱网/长会话 |

性能数据必须记录候选 SHA、硬件/OS、运行时/模型、样本数、网络状态、p50/p95/失败数，并区分系统与模型耗时。本轮无 Android 实机、第二台执行设备、服务器/外网性能样本，均未验证；不把 v1.2 目标写成实测。

## 接口、资产与交接

见 [出站清单](egress-inventory.md)、[归属登记](ownership-register.md)、[第三方声明](third-party-inventory.md)、[模块/写入边界](module-contracts.md) 与 [测试回执](validation.md)。

T00 保持 In Progress：离线基线可交接，生产 constraints 环境、GitHub 实际工作流启用状态、应用标识外部冲突、签名责任、隔离 PostgreSQL 集成与复核人签署尚未完成。T01/T02 可按已明确的地址和来源边界准备增量改动；没有将任何下游任务标为完成。
