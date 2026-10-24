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

T00 的离线准备已可复验；任务保持 **In Progress**，等待以上适用环境证据和复核签署。T01/T02 的后续明确入口见 egress-inventory.md；T03 继续复用现有安全文件/机器身份实现；T07 必须先核验原目录未跟踪的 Android 源码/产物来源。不存在“所有任务已完成”或“客户端可正式发行”的结论。
