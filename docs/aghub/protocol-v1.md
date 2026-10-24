# 协议 v1 入口

当前跨设备文件协议已经在后端实现。本文件只指向现有 schema 和路由，不新增字段，也不建立平行任务 API。字段样例与写入归属见 [module-contracts.md](module-contracts.md)。

## 现有路由

路由定义在 `workspace/backend/app/routers/local_file_requests.py`，前缀 `/v1/local-file-requests`，由 `app/main.py` 挂载。

- `POST /v1/local-file-requests`
- `POST /v1/local-file-requests/{request_id}/inspection`
- `POST /v1/local-file-requests/{request_id}/content`
- `POST /v1/local-file-requests/{request_id}/cancel`
- `GET /v1/local-file-requests/{request_id}`

身份会话沿用 `workspace/backend/app/routers/auth.py`：`POST /v1/auth/session`、`POST /v1/auth/session/renew`。独立身份改造归 T03，这里不替换这些路由。

## 现有约束

`CreateLocalFileRequest` 的字段是 `idempotency_key`、`network`、`recipient_agent_id`、`root_id`、`relative_path`、`request_content`、`channel`。合成样例使用 `synthetic-request-001` 这一组占位值，不含 token、文件正文或真实设备标识。

能力标识是 `local_file_request.v1`。请求 TTL 是 15 分钟。`InspectionResult.size` 上限是 50 MiB，与 `MAX_LOCAL_FILE_BYTES` 相同。审批决定仍走现有 approvals 路由；本协议不另设一套批准接口。

T05 负责执行回执丢失后的 operation/attempt 状态。T06 在现有 Pydantic schema 和 `tests/test_local_file_requests.py` 上验证并发与容量。本样例不是新的 schema。
