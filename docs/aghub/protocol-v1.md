# 协议 v1 入口

当前跨设备文件协议已经在后端实现。本文件指向现有 schema 和路由，不新增后端路由，也不建立平行任务 API。字段样例与写入归属见 [module-contracts.md](module-contracts.md)。

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

## T01 本地客户端配置与会话来源

桌面 `workspace-view:config` 同步返回明确的 `apiUrl`、`webUrl`、`authUrl` 和 `devLoopback`。预加载桥将它们交给共享页面；缺少任一必需来源时显示可填写、保存的服务设置表单，不从 HTML 或 Node 环境补出官方地址。只有明确开发开关允许约定的回环 HTTP。Next 网页优先读取本机保存的非敏感 origins；未保存时读取显式构建期 `NEXT_PUBLIC_*` 配置。

本地 `WorkspaceSession` 和桌面 `EmbeddedSession` 增加 `apiBase` 来源元数据。它记录实际签发令牌的 API origin，由取得会话的客户端/主进程填写；不修改后端 JWT、数据库或身份 API。恢复存储、传递初始会话及推送刷新会话时都核对当前 API。旧的无来源会话或不同来源的会话不能自动重新绑定，需要重新登录。桌面主进程、预加载桥和共享页面应从同一候选版本构建。

服务设置保存桥为 `workspace-view:configure-services`，输入为
`{ apiBase, webBase, authBase, devLoopback }`。仅当前随包页面可调用，
main 重新校验三个 origin，并将 `serviceOrigins` 与 Connector 使用的
`workspaceEndpoint` 一次写入 settings.json。持久写入失败时保留旧配置，
不结束旧会话；成功后清除旧账号与页面存储，重新打开本地首页。
重启恢复该配置，显式开发开关仅应用于当前 app/Connector 进程。
网页端保存到 `aghub_service_configuration_v1`，清除工作区会话及可选浏览器身份后重载；
不会把地址配置当作身份凭据。已配置后仍可从“服务设置”进入编辑或取消。
候选安装说明统一指向本仓库的 `install-candidate.md`，不生成尚未发布的下载地址。
