# Agent Hub：Linux 自托管与上游同步

这是 [OpenAgents](https://github.com/openagents-org/openagents) 的正式 Fork：
**https://github.com/zaiyemeiyou404/agent-hub**。
初始基线为上游 `develop` 的 `195c93e3f3c2fa89582a08dcc7ce17b0709b02ac`。
创建时核对上游和 Fork 的全部 509 条分支、标签引用，完全一致；
`develop` 可追溯 3,560 个提交。没有使用压缩提交或重新初始化 Git。

上游代码、作者、版权声明、根目录 Apache-2.0 `LICENSE` 和各组件已有的许可证声明均保留。
例如 `packages/agent-connector/package.json` 声明 MIT，保留其原文，不将整个仓库重新授权。
本 Fork 新增的配置、说明和示例按 Apache-2.0 提供；商标、官方服务及其凭据不随 Fork 转移。

## 提供的能力

| 需求 | 实现 |
| --- | --- |
| Linux 自托管 | PostgreSQL 16、FastAPI 后端、Next.js 前端；新增独立 Compose 配置 |
| Codex CLI / OpenCode | 保留上游的原生 Launcher 适配器，每种运行时单独认证 |
| 自建 Agent | 保留 ONM HTTP API，并提供复用 BaseAdapter 的可运行 Node.js 示例 |
| 群聊与文件共享 | Workspace 线程、成员权限、上传/下载；数据库和文件分别持久化 |
| 自动协作 | 线程指令、审阅交接、完成后路由；协调模型需要另行配置 |
| 上游同步 | 每日检查、保留提交和标签、生成审阅 PR；冲突时停止，不覆盖 `develop` |

## 1. 在 Linux 上启动

准备 Git、OpenSSL、Docker Engine 及 Docker Compose v2。建议先准备至少 4 GB 内存，
前端构建可能需要更多。以下命令从仓库根目录执行：

```bash
git clone https://github.com/zaiyemeiyou404/agent-hub.git
cd agent-hub
git remote add upstream https://github.com/openagents-org/openagents.git
bash scripts/agent-hub-init.sh
# 如需域名访问，先编辑 workspace/.env 中的 WEB_URL、API_URL。
docker compose --env-file workspace/.env \
  -f workspace/docker-compose.agent-hub.yml up -d --build
curl --fail http://localhost:8000/health
curl --fail http://localhost:8000/ready
```

初始化脚本生成随机数据库密码，使用仅当前用户可读写的权限，并拒绝覆盖已有 `.env`。
配置不会提交真实凭据。`migrate` 成功执行 `alembic upgrade head` 后才会启动后端；
后端就绪后才会启动前端。使用上游 `production.Dockerfile` 和生产依赖约束文件。

默认监听服务器回环地址：前端 `127.0.0.1:3000`，API `127.0.0.1:8000`，数据库不发布端口。
远程首次体验可用 SSH 隧道：

```bash
ssh -L 3000:127.0.0.1:3000 -L 8000:127.0.0.1:8000 user@your-linux-server
```

然后在本机浏览器访问 `http://localhost:3000`。
长期使用时，将 `WEB_URL=https://hub.example.com`、`API_URL=https://api.example.com`
分别设为实际域名，用主机上的 HTTPS 反向代理转发到 3000/8000；API 代理需支持长连接/SSE，
避免响应缓冲和过短超时，并允许所需的上传大小。修改 API_URL 后需重新构建前端。
远端 Agent 必须能访问 API_URL。此部署使用工作区令牌，无需使用官方站点账号；
如需身份登录、邮件、浏览器服务或公网隧道，需另行配置相应服务，不视为已自托管完成。

## 2. 创建工作区

```bash
curl --fail-with-body -X POST http://localhost:8000/v1/workspaces \
  -H 'Content-Type: application/json' \
  -d '{"name":"Agent Hub"}'
```

保存返回 `data` 中的 `workspaceId`、`slug` 和 `token`。
前端打开 `http://localhost:3000/<slug>?token=<token>`。
这条链接含访问凭据，只交给需要进入该工作区的人。通过界面创建线程并添加 Agent。

## 3. 连接 Codex CLI 和 OpenCode

Agent 可以在 Linux 主机或另一台可访问 API 的机器上运行。需 Node.js 22+。
从本 Fork 安装 Launcher，避免安装到与本基线不同的官方最新版本：

```bash
cd packages/agent-connector
npm ci
npm link
cd ../..
export OPENAGENTS_ENDPOINT=http://localhost:8000
agn install codex
agn install opencode
# 分别完成 Codex / OpenCode 的运行时认证和模型设置。
agn create coder --type codex --path /absolute/path/to/project
agn create reviewer --type opencode --path /absolute/path/to/project
agn connect coder '<workspace-token>'
agn connect reviewer '<workspace-token>'
agn up
agn status
```

已有运行时可跳过 `agn install`。安装不等于认证成功。
OpenCode 需要明确模型，例如用 Launcher 环境配置界面，或：

```bash
agn env opencode --set LLM_MODEL=provider/model
```

实际密钥仅保存在运行 Agent 的机器上；可使用各运行时自身的登录流程或受保护的环境文件。
界面先用 `@coder` 请求实现，再让 `@reviewer` 审查。不同机器间文件共享依靠 Workspace 上传；
如果多个 Agent 要修改同一个项目，应另配共享目录或 Git 分支/工作树，避免并发覆盖同一文件。

## 4. 接入自建 Agent

在已安装 connector 依赖的仓库中运行：

```bash
export OPENAGENTS_ENDPOINT=http://localhost:8000
export WORKSPACE_ID='<workspaceId-or-slug>'
export WORKSPACE_TOKEN='<workspace-token>'
export AGENT_NAME=custom-demo
node workspace/agent-hub/custom-agent.cjs
```

把 `custom-demo` 加入线程，`@custom-demo` 发消息。示例会回复并上传一个共享文本文件，
不调用付费模型。替换 `_handleMessage` 中的演示逻辑，即可接入自己的模型或工具服务。
BaseAdapter 负责上线、心跳、轮询、队列、权限上下文、停止控制和完成消息关联。
请在自己的耗时任务中实现取消，并通过 `sendResponse` 返回最终结果。
其他语言可依据 `/docs` 的 OpenAPI 和 ONM `/v1/join`、`/v1/events`、文件接口接入。

## 5. 开启自动协作

部署配置已开启线程协作设置、访问申请、完成后路由和审阅交接的服务端开关。
默认 `ROUTER_LLM_ENABLED=false`：可手动点名，尚未配置自动选派模型。
在 `workspace/.env` 设置：

```dotenv
ROUTER_LLM_ENABLED=true
ROUTER_LLM_PROVIDER=openai
ROUTER_LLM_MODEL=your-provider-model-id
ROUTER_LLM_API_KEY=your-private-key
# 仅兼容接口或自建服务需要设置：
ROUTER_LLM_BASE_URL=https://your-provider.example/v1
COMPLETION_ROUTING_MAX_HANDOFFS=6
```

重新执行 Compose 的 `up -d`，在界面将需要的 Agent 加入同一线程，设置各自职责、
审阅关系和响应模式，然后下达明确的协作任务。模型决定下一位执行者，交接次数有上限。
协调模型凭据与 Codex/OpenCode 各自的凭据互相独立。离线测试使用模拟模型；
真实模型效果和费用需使用你自己的供应商凭据验收。

## 6. 上游同步

`Agent Hub Upstream Sync` 工作流每日 UTC 04:23（北京时间 12:23）执行，也可在 Actions 手动运行。
它读取 `openagents-org/openagents:develop`，补充新标签，在 `sync/upstream-develop` 合并，
创建或更新到 `develop` 的 PR，再手动派发 `Agent Hub Verify`（绕过 GITHUB_TOKEN 推送不触发 CI 的限制）。
不自动合并、不强推、不删除标签。合并冲突会让工作流失败，应在该同步分支解决后继续。
如上游更改默认分支，需要手动审阅并调整工作流。

Fork 的 Actions 可能默认停用；在 Actions 启用这两个 Agent Hub 工作流即可。
工作流权限需允许创建 Pull Request；同步工作流需 contents/pull-requests/actions 写权限。
上游导入的发布、部署等工作流保持停用；启用前应逐个审阅其目标和权限。
公共仓库定时工作流可能因长期无活动而被 GitHub 停用；届时重新启用或手动执行。

也可以本地合并（先确认工作区干净）：

```bash
git fetch upstream --tags
git switch develop
git pull --ff-only origin develop
git switch -c sync/upstream-manual
git merge --no-edit upstream/develop
# 解决冲突、运行检查后，推送这个新分支并创建 PR。
git push -u origin sync/upstream-manual
```

## 7. 维护与验证

日志和状态：

```bash
docker compose --env-file workspace/.env -f workspace/docker-compose.agent-hub.yml ps -a
docker compose --env-file workspace/.env -f workspace/docker-compose.agent-hub.yml logs --tail=100
```

数据保存在 `agent-hub_pgdata` 和 `agent-hub_files` 卷中。更新前同时备份数据库和文件卷，
并保留密钥文件；只备份 Git 仓库不能恢复聊天和上传文件。不要使用 `down -v` 清理已有部署。
数据库迁移可能不可逆，回滚应用版本前应核对迁移兼容性。

新增 `Agent Hub Verify` 在 Ubuntu/Python 3.12/Node 22 上检查 Compose、适配器、
工作区、文件权限、线程协作、完成后路由、审阅交接和响应模式。
首次交付的实际执行情况见 [验证记录](workspace/agent-hub/VALIDATION.md)。
