# 模块与数据写入边界

基线 c82873aad；这是对现有接口的归属映射与后续约束，不表示已完成模块重构或新 API。

| 模块 / 当前代码 | 数据写入归口 | 既有接口 / 下一步 |
| --- | --- | --- |
| 身份：app/access.py、firebase_auth.py、routers/auth.py | users、workspace_memberships 等身份/归属数据 | /v1/auth/session、/session/renew；T03 接入自有身份、设备 session rotation/replay，不能复用当前 bearer 当完整设备会话 |
| 节点：routers/nodes.py、Node/NodePairingCode 模型 | nodes、node_pairing_codes、node_commands | /v1/nodes、/v1/devices；Connector 只经 API 配对/领任务，T03 scope/hash/revoke |
| 线程/Agent：工作区 routers/services、models | workspaces、workspace_members、channels、events、agent_services | /v1/join、/v1/events；X-Agent-Name 为机器请求上下文，服务端须绑定真实 Node/Agent，不能只信请求体 |
| 执行：Connector daemon/adapters，服务端 NodeCommand | 服务端 node_commands；本机运行时会话/项目文件由目标设备写 | Codex/OpenCode 保留原适配器；T04a 验证工具协议，T04b 执行端真实审批，T05 unknown 状态/重试/同目录排队 |
| 审批：routers/approvals.py、services/approvals.py | ApprovalRequest 对应审批数据；读取绑定主体/资源 | /v1/approvals/{id}/approve 或 reject；UI 不直接改变运行时执行状态 |
| 本地文件：routers/local_file_requests.py、Connector local-file-transfer | local_file_requests 与受控 node_commands、files；快照只在目标设备 | local_file_request.v1；T06 在现有快照/哈希协议上补并发与容量约束 |
| 成果：routers/files.py、app/storage.py | files 表由后端写；正文由 local/S3 storage 管理 | 下载需重新授权；共享前端通过 Host 打开/保存，不把 bearer 放 URL |
| 平台 Host：Launcher workspace-host/preload；frontend desktop/host.ts、lib/desktop-host.ts | 仅设备安全存储、受控本机入口；不直接写服务端表 | 共享业务 UI 不 import Electron；Android Host 路径由 T07 选定，不能假设 packages/mobile 已存在 |

## 脱敏协议样例与语义

以下为 CreateLocalFileRequest 的当前字段；身份来自认证上下文，不添加一套平行任务协议：

```json
{
  "idempotency_key": "synthetic-request-001",
  "network": "synthetic-workspace",
  "recipient_agent_id": "synthetic-coder",
  "root_id": "synthetic-approved-root",
  "relative_path": "example.txt",
  "request_content": "share synthetic fixture",
  "channel": "synthetic-thread"
}
```

POST /v1/local-file-requests → /{id}/inspection → 现有审批决定 → /{id}/content；服务端请求与目标 Node/Agent、内容 manifest 绑定。能力标识为 `local_file_request.v1`，受限目标的每次 machine 请求携带 X-Agent-Name。样例不含真实 token、文件正文或现有设备标识。T06 按现有 Pydantic schema 和 tests/test_local_file_requests.py 验证字段/状态，不能把本样例当新增 schema。

任务已执行但回执丢失时不得用 fresh retry 推断失败并重复副作用；T05 负责稳定 operation/attempt 状态，取消只有运行时确认后才显示完成。审批/文件/设备撤销的原子边界以服务端事务实现，Connector 不绕过 API 操作数据库。

T11 在以上模块归口上建立依赖检查和实际审查门禁；禁止用全仓重命名替代边界验证。T08/T10 以同一协议/组件版本验证双 Agent、两种运行时、两台执行设备与双端身份；本轮仅有离线接口回归。
