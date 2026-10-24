# AgentHub 移动端与桌面端产品化项目计划书

> **日期：** 2026-10-20
> **版本：** v2.1（仓库复核与实施基线）
> **项目代号：** AgentHub Client（正式品牌名待定）
> **实施原则：** 在现有 AgentHub/OpenAgents 代码上产品化，不重写已经可用的 Workspace、Connector 和桌面 Launcher。
> **文档状态：** 可用于立项评审、迭代排期、预算估算和发布门禁；不是法律意见或最终商店审核承诺。
> **当前执行依据（2026-10-24）：** [Linear 总计划 v3.7](https://linear.app/zaiyemeiyou/document/aghub-独立产品计划书-v37自主维护双端稳定化-dde8af711101)及[开发清单 v1.2](https://linear.app/zaiyemeiyou/document/aghub-独立产品开发清单-v12模块化审查成熟化-38d0d39d5273)。本文件保留历史研究与复核结果；旧四人产能、日期、市场门槛及暂停 Linear 的安排已被新计划替代。当前实施与证据见 [T00 基线](../aghub/implementation-baseline.md)，代码通过 feature 分支审查。

## 一、项目摘要

### 1.1 项目目标

把当前浏览器中的 AgentHub 工作区做成可分发的产品：

- **桌面端：** Windows、macOS、Linux 应用，可管理本机 Connector 和本地 Agent；
- **移动端：** Android、iOS 应用，作为聊天、审批、文件和设备管理控制端；
- **Web 端：** 保留当前 `aghub.zaiyemeiyou.com`，与客户端共用后端和大部分前端组件；
- **安全目标：** 不再依赖 URL 中长期携带 Workspace Token，人与机器凭据分离，每台设备可单独撤销。

### 1.2 推荐结论

1. **桌面端继续使用仓库中已经成型的 Electron Launcher，不迁移 Tauri。** 现有代码已经包含 Electron 主进程、Workspace 静态 Bundle、系统通知、自动更新、Windows/macOS/Linux 打包、签名与发布工作流。迁移会造成重复投入和新风险。
2. **移动端新增 Capacitor Shell。** Capacitor 可以加入现有 Web 项目并生成原生 Android/iOS 工程，适合复用当前 React UI，同时按需接入通知、相机、文件、深度链接等原生能力。[1][2]
3. **移动端不是本地 Agent 运行器。** 手机主要承担对话、通知、审批、文件和远程管理；Claude Code、Codex、Hermes、OpenCode 等 CLI 继续在桌面或服务器设备上运行。
4. **不能把正式产品做成纯远程网页 WebView。** Apple 的最低功能要求明确限制“重新包装的网站”类应用；正式版必须提供通知、扫码配对、文件分享、安全凭据、深度链接等移动原生价值。[4]

### 1.2.1 可行性结论

| 维度 | 结论 | 评分 | 关键依据/条件 |
|---|---|---:|---|
| 技术可行性 | 高 | 8.5/10 | Web Workspace、Connector、Electron Launcher、设备配对和文件审批已有真实代码与生产运行基础 |
| 产品可行性 | 中高 | 7.5/10 | 市场已有远程 Agent 控制产品，但“跨厂商 Agent + 团队 Workspace + 自托管安全治理”仍有差异化空间 |
| 交付可行性 | 中高 | 7.5/10 | Windows/Android 可优先闭环；iOS/macOS 受账号、签名、公证和审核节奏影响 |
| 商业许可 | 中高 | 8/10 | 根仓库 Apache-2.0，部分组件 MIT；允许商业使用，但品牌、素材与第三方依赖仍须审计 |
| 安全成熟度 | 中 | 6.5/10 | 已有审批与路径隔离；用户/设备/Node/Agent 四层身份、会话撤销和客户端安全存储仍需产品化 |
| 运维可行性 | 高 | 8/10 | 当前 Linux + Docker Compose + Caddy 已稳定运行；需要补监控、备份演练、容量阈值和发布回滚 |

**综合判断：有条件 Go。** 项目不需要重写核心协作平台，建议批准一个 2 周“验证与安全底座”阶段。只有 M0/M1 门槛全部通过，才投入完整移动端和商店发布。

### 1.2.2 成功定义

首个商业验证版不是“应用已经打包”，而是同时满足：

1. Windows 与 Android 从安装、配对、发消息到 Agent 回复形成真实闭环；
2. 敏感文件请求可以在手机完成身份核验、审批、释放和审计；
3. 丢失任一手机或桌面设备时，可单独撤销且不影响其他设备；
4. URL、普通日志、推送、分析和崩溃报告中没有长期凭据与敏感正文；
5. 服务端可备份、恢复、监控、升级和回滚；
6. 安装包、依赖、素材和品牌满足发布许可证要求。

### 1.3 预计投入

- **标准团队：** 3～4 名核心开发，10～12 个日历周；
- **总工作量：** 约 25 人周；
- **单人全职开发：** 约 16～20 周；
- **建议首发：** Windows + Android；iOS/macOS 同步开发但放在第二个发布门槛，避免签名、审核拖慢第一轮验证。
- **估算置信度：** 当前为 ROM（量级估算），误差约 ±30%；完成 M0 技术验证后重新基线化。

---

## 二、现有基础评估

### 2.1 已经具备的能力

| 能力 | 当前状态 | 代码依据 |
|---|---|---|
| Web Workspace | 已生产运行 | `workspace/frontend`、`workspace/backend` |
| 桌面应用主框架 | 已存在 | `packages/launcher` |
| Windows/macOS/Linux 打包 | 已存在 | `packages/launcher/package.json` 的 `build:win/build:mac/build:linux` |
| Electron 自动更新 | 已存在 | `electron-updater`、`.github/workflows/desktop-build.yml` |
| Workspace 静态桌面构建 | 已存在 | `workspace/frontend/desktop`、`build:desktop` |
| 桌面端登录/会话方案 | 已有实现和文档 | `packages/launcher/src/main/auth`、`docs/desktop-sign-in.md` |
| 系统通知桥接 | 已存在 | `desktop-host.ts`、`notifications.ts` |
| Connector 与本机 Agent 管理 | 已存在 | `packages/agent-connector`、`packages/launcher/src/main/agent-manager.ts` |
| 设备配对 | 已存在 | `node-pairing.ts`、后端 pairing API |
| 安全本地文件请求 | feature 分支已部署 | `local_file_request.v1`、Alembic `084` |
| Android/iOS 原生工程 | 尚不存在 | 仓库中无 Capacitor 配置或原生工程 |

### 2.2 当前不能直接发布为产品的关键问题

1. **Workspace Token 权限过大。** 当前机器凭据拥有完整 Workspace 访问能力，不适合作为普通手机用户长期凭据。
2. **Token 仍可能出现在 URL。** 桌面 Workspace Host 的 `_urlFor()` 仍会将 token 加入 query string；正式产品必须改为主进程/原生层注入短期会话。
3. **桌面安全存储默认未开启。** `session-store.ts` 默认将会话保存在权限为 `0600` 的文件中，系统 Keychain 加密仅在环境变量启用时使用；产品版需要重新定义安全存储和恢复策略。
4. **Connector 版本未统一。** Launcher 当前依赖 `@openagents-org/agent-launcher@0.2.194`，公开 npm 已有更新，而安全本地文件协议仍位于当前 feature 代码中。发布前必须统一版本、协议能力和升级策略。
5. **移动推送链路不存在。** 前端有浏览器通知权限逻辑，但没有 APNs/FCM 设备注册、服务端推送和点击回跳闭环。
6. **品牌与上架材料缺失。** 应用名、图标、隐私政策、服务条款、支持页面、应用商店截图和数据收集说明均需建立。

---

## 三、产品定义

### 3.1 目标用户

- 在服务器或个人电脑上运行多个 AI Agent 的个人用户；
- 需要跨设备查看任务、处理审批的开发者；
- 小型团队或实验室，希望多个 Agent 在共享 Workspace 协作；
- 自托管用户，希望服务和数据由自己控制。

### 3.2 核心用户场景

1. 用户在桌面应用安装并连接 Hermes/Codex/Claude/OpenCode；
2. 用户用手机扫码加入同一 Workspace；
3. 手机向 Agent 发任务，桌面/服务器上的 Agent 执行；
4. Agent 遇到敏感文件或高风险操作，手机收到推送并审批；
5. 用户离开电脑后继续查看过程、下载产物或追加指令；
6. 管理员可查看在线设备、撤销丢失设备、关闭某个 Agent 的权限。

### 3.3 MVP 范围

#### 移动端必须包含

- 首次启动和服务器地址选择；
- 扫码/配对码加入 Workspace；
- 工作区列表；
- 私聊、频道、消息历史；
- Agent 在线状态和基础资料；
- 文件选择、拍照上传、下载与系统分享；
- 审批列表和审批详情；
- 敏感文件审批中的双方 Agent/设备身份展示；
- 推送通知及点击进入指定会话/审批；
- 网络中断提示和自动重连；
- 退出、设备撤销、应用锁。

#### 桌面端必须包含

- 当前 Launcher 的安装、登录和 Workspace 能力；
- 自托管 Endpoint 首次设置与连接测试；
- 本机 Connector 开机自启、状态和日志；
- 本机 Agent 安装、登录、启动、停止和升级；
- Workspace 与“此电脑”一体化导航；
- 系统托盘、系统通知、深度链接；
- Windows 安装包和自动更新；
- macOS 签名、公证和更新链路；
- Linux AppImage/deb（具体格式沿用现有构建配置）。

#### MVP 明确不做

- 在手机上直接运行 Claude Code/Codex/Hermes CLI；
- 端到端加密聊天重构；
- 大规模多租户计费系统；
- 从第一版开始重写实时通信协议；
- 第一版同时支持多个完全不同品牌的白标发行。

---

## 四、技术架构

### 4.1 总体结构

```text
┌──────────────────────── 客户端层 ────────────────────────┐
│ Web / Next.js                                             │
│ Desktop / Electron Launcher + Workspace Bundle            │
│ Mobile / Capacitor + Shared React Bundle                  │
└───────────────────────────┬───────────────────────────────┘
                            │ HTTPS
┌──────────────────────── 服务端层 ─────────────────────────┐
│ AgentHub Backend                                           │
│ ├─ 用户会话与设备会话                                      │
│ ├─ Workspace / Agent / Message / File / Approval          │
│ ├─ Push Dispatch（APNs / FCM）                             │
│ └─ 审计日志与设备撤销                                      │
└───────────────────────────┬───────────────────────────────┘
                            │ Node/Agent credential
┌──────────────────────── 执行设备层 ────────────────────────┐
│ Agent Connector                                            │
│ ├─ Hermes / Codex / Claude / OpenCode / Custom            │
│ ├─ 本地文件授权根                                          │
│ └─ local_file_request.v1                                  │
└────────────────────────────────────────────────────────────┘
```

### 4.2 前端复用策略

不复制三份 UI。将当前平台差异收敛到 Host Adapter：

```ts
interface PlatformHost {
  platform: 'web' | 'desktop' | 'mobile';
  secureCredentials: boolean;
  notifications: boolean;
  camera: boolean;
  share: boolean;
  localAgentRuntime: boolean;

  getSession(): Promise<AppSession | null>;
  saveSession(session: AppSession): Promise<void>;
  pickFiles(): Promise<SelectedFile[]>;
  openExternal(url: string): Promise<void>;
  registerPush?(): Promise<PushRegistration>;
}
```

建议目录：

```text
workspace/frontend/
├─ app/                       # 当前 Web 页面
├─ components/                # 三端共享组件
├─ lib/platform/              # 新增统一平台抽象
│  ├─ host.ts
│  ├─ web-host.ts
│  ├─ desktop-host.ts
│  └─ mobile-host.ts
├─ desktop/                   # 保留现有 Vite 桌面入口
└─ mobile/                    # 新增移动入口与路由适配

packages/
├─ launcher/                  # 保留 Electron 桌面产品
├─ agent-connector/           # 设备与 Agent 执行层
└─ mobile/                    # 新增 Capacitor 原生工程
   ├─ android/
   ├─ ios/
   ├─ capacitor.config.ts
   └─ package.json
```

### 4.3 为什么桌面端不迁移 Tauri

现有 Electron Launcher 已经不是空壳，它已经实现：

- 三平台构建脚本；
- 签名、公证和自动更新；
- Workspace 本地 Bundle；
- Preload/IPC/Host Bridge；
- Agent 安装和运行时管理；
- 网络代理和中国区下载镜像；
- 登录回环服务；
- 系统通知和托盘；
- Playwright E2E。

Electron 官方建议启用 context isolation、禁用 Node integration、限制导航与新窗口等安全措施；当前代码已执行其中多项，但正式发布前仍需按官方安全清单逐项审计。[3]

### 4.4 移动端方案

使用 Capacitor 管理 Android/iOS 原生工程，Web Bundle 在应用内本地加载，不以远程首页作为唯一入口。Capacitor 的官方工作流支持将现有 Web 项目加入原生平台，并通过插件访问原生 API。[1]

首批原生插件能力：

- App lifecycle；
- Push Notifications；
- Camera；
- Filesystem/File Picker；
- Share；
- Browser；
- App/Deep Links；
- Haptics；
- Network；
- 自研或经审计的安全凭据存储插件。

Capacitor 的推送插件负责设备端注册和消息处理，但服务端仍需维护推送 token，并向 APNs/FCM 发送通知。[2]

---

## 五、身份与安全方案

### 5.1 凭据分层

| 凭据 | 使用者 | 权限 | 存储方式 |
|---|---|---|---|
| Workspace 管理凭据 | 初始化/应急管理 | 高权限 | 不进入普通客户端长期存储 |
| 用户会话 | 手机/桌面 UI | 按成员角色授权 | Keychain/Keystore/系统安全存储 |
| 设备会话 | 每台手机/桌面 | 设备级，可独立撤销 | 原生安全存储 |
| Node Token | Connector | 仅该执行设备 | `node.json`，权限限制并逐步加密 |
| Agent Session | 单个 Agent | 消息与心跳 | Connector 内部管理 |

### 5.2 配对流程

```text
管理员生成一次性配对码/二维码
        ↓
客户端提交 code + device public metadata
        ↓
服务端校验有效期、次数、Workspace 和发起人权限
        ↓
签发 scoped device session
        ↓
客户端安全存储；配对码立即作废
```

要求：

- 配对码单次使用、短时有效；
- 不把 Workspace Token 交给普通手机应用；
- 每台设备显示名称、系统、最近在线和创建时间；
- 管理员可单独撤销；
- token 不写 URL、日志、分析事件或崩溃报告；
- 刷新 token 支持旋转与重放检测。

### 5.3 桌面安全整改

- 保留 `contextIsolation: true`、`nodeIntegration: false`；
- 对 IPC payload 做 schema 校验；
- 默认启用系统凭据安全存储，无法加密时给出明确降级提示；
- Workspace Token 不再通过 query string 传入 Renderer；
- Renderer 只能拿短期 UI Session，Connector Token 不进入 Renderer；
- 导航继续采用 origin allowlist；
- 禁止任意 `window.open`、WebView attach 和非白名单 scheme；
- Release 构建执行依赖漏洞扫描、签名验证和安装后启动检查。

### 5.4 应用商店约束

- Apple 要求应用具有超出“重新包装网站”的持续价值，因此移动端必须把推送、扫码、文件分享、审批和设备安全作为首发能力。[4]
- 如果未来在 iOS 主登录流程中使用 Google/GitHub 等第三方登录，需要同步评估并实现 Apple 指定的等价登录方式；Apple 的登录服务规则对此有明确要求。[4]
- Google Play 同样不接受功能不足、内容有限或不稳定的应用，因此 Android 首发不能只显示一个远程 WebView。[5]

---

## 六、实施阶段与里程碑

## M0：产品与技术验证（第 1 周）

### 目标

确认品牌、分发范围、移动 Bundle 可行性和身份方案，不进入大规模开发后再返工。

### 工作项

- 确定产品名、包名、域名和图标方向；
- 明确开源版与商业发行版边界；
- 建立 `packages/mobile` Capacitor 最小工程；
- 将现有 Workspace Vite Bundle 在 Android Emulator 与 iOS Simulator 启动；
- 验证路由、中文输入、文件选择、返回键、安全区和深色模式；
- 输出身份与设备 session API 设计；
- 决定首发平台：默认 Windows + Android。

### 退出标准

- Android 模拟器可进入现有 Workspace；
- 不依赖远程首页即可加载 UI；
- 形成经过评审的认证 API 和数据模型；
- 产品名和包标识不再变动。

## M1：身份、安全与版本统一（第 2～3 周）

### 目标

建立正式客户端可以依赖的安全底座。

### 工作项

- 新增用户/设备 session 模型和 migration；
- 配对码签发 scoped device session；
- 新增设备列表、撤销、刷新和审计 API；
- 移除 UI 对 URL Workspace Token 的依赖；
- 桌面端安全存储默认化；
- Connector 与 Launcher 依赖统一到包含 `local_file_request.v1` 的版本；
- 定义客户端能力协商字段；
- 增加 token 泄漏、越权、撤销、重放和过期测试。

### 退出标准

- 普通客户端无法取得机器 Workspace Token；
- 撤销设备后，下一次 API 调用立即失败；
- URL、服务日志和客户端日志中找不到凭据；
- 桌面、移动、Connector 协议版本矩阵通过。

## M2：桌面端产品化（第 3～5 周，可与 M1 后半并行）

### 目标

把现有 Launcher 变成可交付的自托管 AgentHub 桌面产品。

### 工作项

- 更换品牌名、应用 ID、图标和协议 scheme；
- 首次启动加入 Endpoint 配置与连通性测试；
- 工作区连接、设备授权和 Connector 状态统一；
- 完成通知点击回到具体会话/审批；
- 完成 Windows 安装、卸载、升级和回滚测试；
- 完成 macOS 签名、公证、Apple Silicon/Intel 构建；
- Linux 构建和权限测试；
- 清理 OpenAgents 官方域名的硬编码依赖；
- 建立自己的更新源和 Release 签名流程。

### 退出标准

- Windows 干净虚拟机双击安装并能连接自托管服务；
- 应用重启后会话和 Connector 状态恢复；
- 自动更新失败不破坏旧版本；
- Windows/macOS 安装包签名可验证；
- 本机 Agent 启停、日志、消息回复全部实测通过。

## M3：移动端 MVP（第 4～7 周）

### 目标

完成 Android/iOS 控制端核心闭环。

### 工作项

- 移动端路由、底部导航和触摸适配；
- Workspace 配对、扫码和深度链接；
- 私聊、频道、消息发送与历史加载；
- Agent/设备在线状态；
- 文件选择、相机上传、下载与分享；
- 审批列表、详情、同意和拒绝；
- 本地应用锁、退出和设备撤销；
- 网络切换、离线提示、前后台恢复；
- Android 返回键、安全区、键盘遮挡处理；
- iOS 安全区、文件权限和后台通知处理。

### 退出标准

- Android/iOS 均能从配对到完成一次 Agent 对话；
- 能完成一次敏感文件审批；
- 上传/下载 20MB 文件无崩溃；
- 断网恢复后不重复发送消息或审批；
- token 不进入 WebView localStorage 明文和 URL。

## M4：推送、质量与发布（第 8～10 周）

### 目标

完成可公测发行版，而非内部演示包。

### 工作项

- 建立 APNs/FCM token 注册和失效清理；
- 推送事件：私信、@提及、任务完成、审批请求、Agent 离线；
- 点击推送进入指定 Workspace/会话/审批；
- 消息去重、通知聚合和免打扰；
- 崩溃报告脱敏；
- 隐私政策、服务条款、支持页面和删除账户说明；
- TestFlight、Google Play Internal Testing；
- Windows Beta Release；
- 安全复核、性能测试和灰度发布。

### 退出标准

- 应用被系统杀死后仍能收到远程通知；
- 点击通知能准确恢复页面；
- 推送 payload 不包含消息正文或敏感文件信息；
- 72 小时稳定性测试无高优先级崩溃；
- 商店审核资料完整，测试账号和审核说明可用。

---

## 七、人员配置与工作量

### 7.1 推荐团队

| 角色 | 配置 | 主要职责 |
|---|---:|---|
| 技术负责人/全栈 | 1 | 架构、认证、后端、代码评审 |
| React/移动端工程师 | 1 | Capacitor、移动 UI、原生插件 |
| Electron/Connector 工程师 | 1 | 桌面打包、本机 Agent、更新与签名 |
| QA/发布工程师 | 0.5～1 | 自动化、设备矩阵、商店与发布 |
| 产品/视觉设计 | 0.5 | 品牌、移动交互、上架素材 |
| 安全评审 | 按里程碑介入 | M1 与发布前复核 |

### 7.2 工作量拆分

| 模块 | 估算 |
|---|---:|
| 技术验证与产品定义 | 2 人周 |
| 身份、安全与协议统一 | 4 人周 |
| 桌面端产品化 | 4 人周 |
| 移动端核心功能 | 6 人周 |
| 推送、发布与商店材料 | 4 人周 |
| QA、自动化与安全复核 | 5 人周 |
| **合计** | **约 25 人周** |

估算包含现有代码复用，不包含大规模 UI 重设计、商业计费系统或端到端加密重构。

---

## 八、测试与验收方案

### 8.1 自动化层级

1. **单元测试**：平台 Host Adapter、token 生命周期、深度链接、消息去重；
2. **后端集成测试**：配对、刷新、撤销、角色权限、推送 token；
3. **桌面 E2E**：安装、登录、连接 Agent、收发消息、自动更新；
4. **移动 E2E**：配对、消息、文件、审批、通知点击；
5. **公网 Smoke**：对生产 Endpoint 执行真实 Workspace/Agent/文件闭环；
6. **安全测试**：路径逃逸、越权、token 泄漏、重放、失效设备、恶意深链。

### 8.2 设备矩阵

- Windows 10、Windows 11；
- macOS Intel、Apple Silicon；
- Ubuntu LTS；
- Android 10、12、14、最新稳定版；
- iOS 16、17、最新稳定版；
- 弱网、Wi-Fi/移动网络切换、代理网络、中国大陆网络环境。

### 8.3 核心验收指标

| 指标 | 目标 |
|---|---|
| 冷启动到可操作 | 中端手机目标小于 3 秒，桌面目标小于 5 秒 |
| 消息重复率 | 0 |
| 配对成功率 | 测试环境大于 99% |
| 崩溃自由会话 | Beta 阶段大于 99.5% |
| 设备撤销生效 | 下一次请求即失效 |
| 凭据泄漏 | URL、普通日志、分析事件中为 0 |
| 审批身份完整性 | 请求方、接收方 Agent/设备全部展示 |
| 更新失败恢复 | 保留可启动的上一版本 |

---

## 九、发布与运维

### 9.1 发布通道

- `dev`：每次 feature 分支构建；
- `beta`：内部测试和灰度用户；
- `stable`：签名、公证、完整回归后发布；
- Connector、Desktop、Mobile 分别版本化，但维护兼容矩阵。

### 9.2 CI/CD

新增或扩展：

```text
.github/workflows/
├─ desktop-build.yml          # 现有，改为自有品牌和更新源
├─ workspace-desktop-bundle.yml
├─ mobile-android.yml         # 新增 APK/AAB 构建与签名
├─ mobile-ios.yml             # 新增 archive/TestFlight
├─ client-security.yml        # 凭据扫描、依赖审计、SBOM
└─ release-candidate.yml      # 协议矩阵 + smoke + 发布门禁
```

Android 正式发行应使用 Play App Signing/上传密钥流程，并把签名密钥与 CI 权限隔离。[6]

### 9.3 可观测性

- 客户端版本、平台、协议能力和最后在线；
- API 错误率、推送成功率、配对失败原因；
- 崩溃报告必须先脱敏；
- 默认不采集消息正文、文件正文、绝对路径、凭据值；
- 用户可关闭非必要分析。

---

## 十、主要风险与缓解

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 被商店认定为简单套壳 | 无法上架 | 首发包含推送、扫码、文件、分享、审批、设备安全 |
| Workspace Token 泄漏 | Workspace 被完全接管 | 人机凭据分离、短期会话、设备撤销、禁止 URL token |
| iOS 第三方登录审核 | 审核延期 | MVP 优先邮箱/配对；使用第三方登录时同步实现合规登录方案 |
| 移动后台限制 | 无法持续轮询 | 使用 APNs/FCM，不依赖后台常驻 WebView |
| Electron 包体较大 | 下载和升级成本 | 沿用差分更新、按平台发布；不为减包体重写成熟桌面端 |
| Connector 协议漂移 | 文件审批或 Agent 管理失效 | 发布前统一版本并做 capability handshake |
| 自托管 Endpoint 配置错误 | 用户无法连接 | 首次启动连接检测、证书错误解释、可恢复配置页 |
| 上游代码持续变化 | 合并成本 | 建立产品分支边界，减少直接改上游共享核心 |
| 签名/公证密钥泄漏 | 供应链风险 | 独立发布环境、最小权限、密钥轮换、Release 审批 |

---

## 十一、Go / No-Go 决策门槛

### 进入开发（M0 → M1）

- 品牌、包名和首发平台确认；
- Android/iOS Bundle PoC 通过；
- 身份模型评审通过；
- 确认不迁移 Electron。

### 进入公测（M3 → M4）

- URL 中无长期凭据；
- 撤销、过期、重放测试通过；
- 桌面和移动完成端到端 Agent 回复；
- 审批与文件安全 smoke 通过；
- 无 P0/P1 已知缺陷。

### 正式发布

- 安全复核通过；
- Windows/macOS 包签名验证通过；
- Android/iOS 商店材料齐全；
- 72 小时稳定性测试通过；
- 回滚方案和旧版本下载可用；
- 隐私政策与数据删除流程上线。

---

## 十二、建议立即执行的第一批任务

1. 从当前 feature 分支再创建产品分支：`feat/agenthub-client-product`；
2. 保留现有 Electron Launcher，先完成品牌和 Endpoint 解耦；
3. 新建 `packages/mobile`，完成 Android Emulator 的 Capacitor PoC；
4. 编写 `docs/architecture/client-auth.md`，冻结人/设备/Node/Agent 四层身份；
5. 给 Workspace URL Token 写泄漏回归测试，再替换为 Host Session 注入；
6. 发布包含 `local_file_request.v1` 的统一 Connector 版本；
7. 建立 Android、Windows 两条 Beta 构建流水线；
8. 完成第一轮真实设备验证后，再启动 iOS/macOS 商店发布工作。

## 十三、最终建议

本项目不是从零开始。当前代码已经完成了最难的部分：Workspace、Agent Connector、Electron Launcher、跨平台打包、安全文件请求和生产服务。可靠路径不是重新选一套桌面技术，而是：

> **保留 Electron 桌面能力，新增 Capacitor 移动端，先重构身份和凭据，再做移动原生能力与发布。**

按此方案，第一版可以在约 10～12 周形成可公测的 Windows + Android 产品，同时保留 iOS/macOS 的同构扩展路径。

---

## 十四、市场定位与竞争可行性

### 14.1 不应进入的同质化方向

以下能力已有多类产品覆盖，单独存在不足以构成商业壁垒：

- 手机远程查看 Claude/Codex 运行状态；
- 多开终端或多 worktree；
- 给编码 Agent 发消息并接收完成通知；
- 将现有网页简单封装成桌面或移动 WebView；
- 仅以“支持多个模型”为卖点。

### 14.2 推荐定位

> **AgentHub 是可自托管的多 Agent 协作与安全治理中枢，而不是另一个远程终端。**

差异化按优先级排序：

1. **跨厂商协作：** Hermes、Codex、Claude Code、OpenCode、GrokBot 和自定义 Agent 进入同一 Workspace；
2. **人与 Agent 共同工作：** 私聊、频道、任务、文件和审批使用统一上下文；
3. **双向身份治理：** 请求方与接收方 Agent ID、双方设备身份、能力与版本均可审计；
4. **本地数据边界：** 文件只从明确授权根释放，服务端不接受任意绝对路径；
5. **私有部署：** 企业、实验室和个人可在自己的 Linux 环境运行，不被单一模型供应商绑定；
6. **中国网络环境：** 自定义 Endpoint、镜像、代理和更新源，不假设可直连所有海外服务。

### 14.3 首批验证用户

M0 期间至少访谈或试用以下三类用户，每类不少于 3 名：

| 用户群 | 需要验证的问题 | 通过信号 |
|---|---|---|
| 多 Agent 个人开发者 | 是否愿意用一个 Workspace 代替多个终端/网页 | 每周使用 3 天以上，至少连接 2 种 Agent |
| 小团队/实验室 | 是否需要共享会话、审批和设备治理 | 至少 2 人共同处理一个真实任务 |
| 自托管/安全敏感用户 | 是否愿意为部署、审计和支持付费 | 明确提出部署、SLA、权限或合规需求 |

### 14.4 产品验证指标

- 首次安装至首次 Agent 回复：中位数小于 15 分钟；
- 配对成功率：测试期大于 95%，公测目标大于 99%；
- 7 日内完成第二次有效会话的用户比例：目标大于 40%；
- 活跃 Workspace 中连接两种以上 Agent 的比例：目标大于 30%；
- 审批通知到处理完成的中位时间：小于 5 分钟；
- 用户明确认可的核心价值必须至少包含“协作、安全、自托管”之一，不能只有“手机能看”。

---

## 十五、商业模式与版本边界

### 15.1 建议版本

| 版本 | 目标用户 | 主要内容 | 商业方式 |
|---|---|---|---|
| Community | 个人/开发者 | 单节点自托管、基础 Workspace、Connector、社区支持 | 免费，用于获客与生态 |
| Pro | 高级个人/小团队 | 桌面与移动客户端、推送、自动备份、增强审计 | 订阅或永久授权 + 更新服务 |
| Team | 团队/实验室 | 成员角色、设备策略、集中审计、团队备份 | 按成员或 Workspace 收费 |
| Enterprise | 企业/私有环境 | SSO、策略模板、离线部署、SLA、审计导出 | 年度合同与部署服务 |

### 15.2 开源与商业边界建议

- 上游 Apache-2.0/MIT 代码继续保留原许可证；
- 自有服务端增强可以选择开源、开放核心或商业插件，但必须维护清晰的模块边界；
- 不通过隐藏许可证、删除归属或冒充上游官方形成“商业差异”；
- 商业价值优先放在可靠发行、移动推送、组织治理、备份恢复、合规和支持服务；
- 在品牌确定前，所有安装包和商店素材不得使用“OpenAgents 官方”措辞。

### 15.3 收费验证顺序

1. 先验证用户是否持续使用，而非先开发复杂计费；
2. 第一阶段用人工发放授权或邀请码，不建设完整 Billing；
3. 有 10 个以上稳定试用 Workspace 后，再确定按用户、设备还是 Workspace 计费；
4. 企业功能必须由真实客户需求触发，避免提前建设 SSO/SCIM/多地域等高成本功能。

---

## 十六、许可证、商标与供应链合规

### 16.1 当前判断

- 根仓库 `LICENSE` 为 Apache License 2.0，允许使用、修改、分发、再许可和商业销售；
- `packages/agent-connector`、`packages/launcher`、`sdk/studio` 的 `package.json` 声明 MIT；
- Apache-2.0 不授予上游商标、产品名、Logo 或官方背书；
- 当前仓库没有根 `NOTICE` 文件，但发布时仍要保留所有适用版权、商标和归属声明；
- 该判断只覆盖已确认代码，不自动覆盖图片、字体、截图、模型服务、第三方 Agent 和构建工具。

### 16.2 发布前合规交付物

```text
compliance/
├─ LICENSES/
│  ├─ Apache-2.0.txt
│  ├─ MIT.txt
│  └─ third-party/*.txt
├─ THIRD_PARTY_NOTICES.md
├─ sbom/
│  ├─ backend.spdx.json
│  ├─ frontend.spdx.json
│  ├─ desktop.spdx.json
│  └─ mobile.spdx.json
├─ asset-register.csv
├─ dependency-exceptions.md
└─ trademark-review.md
```

### 16.3 审计范围

1. npm/pnpm 直接与传递依赖；
2. Python wheels 与系统包；
3. Electron、原生二进制和自动更新组件；
4. Gradle/Maven 与 CocoaPods/SPM 依赖；
5. 字体、图标、图片、截图、音效和商店素材；
6. Claude/OpenAI/Grok 等 SDK 与服务条款；
7. “OpenAgents”“AgentHub”等名称的商标和应用商店冲突；
8. 复制或参考的竞品代码，禁止引入 Commons Clause、SSPL 或未知来源代码而不评审。

### 16.4 合规门禁

- 未识别许可证的依赖不得进入 Release；
- GPL/AGPL/Commons Clause/SSPL 等依赖必须单独评审传播和服务限制；
- 每个正式安装包必须能展示开源许可证；
- SBOM 与安装包版本一一对应并随 Release 归档；
- 品牌最终采用自有名称和 Logo，关于页注明基于 OpenAgents 开源项目修改且非官方产品。

---

## 十七、详细工作分解结构（WBS）

### 17.1 工作包

| ID | 工作包 | 主要输出 | 前置 | 估算 |
|---|---|---|---|---:|
| WP-01 | 产品与竞品验证 | 定位、访谈、竞品矩阵、MVP 冻结 | 无 | 1.5 人周 |
| WP-02 | 品牌与合规基线 | 名称检索、许可证矩阵、素材台账 | WP-01 | 1.0 人周 |
| WP-03 | 身份与会话 | 用户/设备 session、刷新、撤销、审计 | WP-01 | 3.0 人周 |
| WP-04 | 协议与 Connector | capability、版本矩阵、安全文件协议发行 | WP-03 | 1.5 人周 |
| WP-05 | 桌面产品化 | 品牌、Endpoint、凭据、更新、签名 | WP-03/04 | 3.5 人周 |
| WP-06 | 移动基础 | Capacitor、导航、配对、安全存储 | WP-03 | 3.0 人周 |
| WP-07 | 移动核心 | 消息、文件、审批、设备管理 | WP-06 | 3.5 人周 |
| WP-08 | 推送与深链 | APNs/FCM、路由、去重、免打扰 | WP-03/06 | 2.0 人周 |
| WP-09 | QA 与安全 | 自动化、弱网、权限、供应链、安全复核 | 全程 | 4.0 人周 |
| WP-10 | 发布与运维 | CI、签名、商店、监控、备份、回滚 | WP-05/07/08 | 2.0 人周 |

合计约 25 人周；管理、等待审核和返工不计入纯工程人周，因此日历周期按 10～12 周安排。

### 17.2 关键路径

```text
产品/MVP 冻结
  → 身份与设备会话
  → URL Token 清除
  → 移动安全存储与配对
  → 消息/审批/文件闭环
  → 推送与深链
  → 安全回归与商店发布
```

桌面品牌化可以与移动基础并行，但不得绕过身份与会话改造直接发布。

### 17.3 两周迭代建议

| Sprint | 目标 | 可演示结果 |
|---|---|---|
| S0 | 技术/商业验证 | Android PoC、本地 Bundle、竞品矩阵、身份 ADR |
| S1 | 会话安全底座 | 设备 session、撤销、刷新、审计 API |
| S2 | Windows 产品闭环 | 自定义 Endpoint、系统安全存储、安装与恢复 |
| S3 | Android 核心闭环 | 配对、对话、Agent/设备状态 |
| S4 | 文件与审批 | 上传下载、敏感请求、手机审批、去重 |
| S5 | 推送与发布候选 | 推送、深链、72 小时稳定性、Beta 包 |

---

## 十八、RACI 与决策机制

角色缩写：PO 产品负责人、TL 技术负责人、BE 后端、FE 前端/移动、DE 桌面/Connector、QA 质量、SEC 安全、OPS 运维。

| 事项 | A 最终负责 | R 执行 | C 咨询 | I 知会 |
|---|---|---|---|---|
| MVP 与版本边界 | PO | PO/TL | FE/DE/BE | 全员 |
| 身份与权限模型 | TL | BE | SEC/FE/DE | PO/QA |
| 移动技术方案 | TL | FE | BE/QA | PO |
| 桌面签名与更新 | TL | DE/OPS | SEC/QA | PO |
| 安全文件协议 | TL | BE/DE | SEC/QA | PO |
| 许可证与品牌 | PO | PO/SEC | 法律顾问/TL | 全员 |
| 生产发布 | OPS | OPS/TL | QA/SEC | PO |
| Go/No-Go | PO | TL/QA 提供证据 | SEC/OPS | 全员 |

决策采用 ADR（Architecture Decision Record）；涉及认证、协议、持久化、第三方 SDK 和发布格式的决定必须写入 `docs/architecture/decisions/`。

---

## 十九、成本与 TCO 模型

### 19.1 一次性成本

| 项目 | 估算方式 |
|---|---|
| 开发 | 25 人周 × 团队综合人周成本 |
| 设计与品牌 | 0.5～1.5 人月，取决于是否外包完整视觉系统 |
| 安全评审 | M1 与 Release Candidate 两次专项评审 |
| 法律与许可证 | 商标检索、隐私政策、服务条款、第三方许可证复核 |
| 测试设备 | 至少 2 台 Android、2 台 iPhone、Windows/macOS 测试机或云真机 |
| 商店与签名 | Apple/Google 开发者账号、代码签名证书及可能的 EV 证书 |

### 19.2 持续成本

| 成本项 | 主要驱动因素 | 控制方式 |
|---|---|---|
| Linux 服务器 | 用户、消息、文件和并发连接数 | 容量阈值、对象存储、按阶段扩容 |
| 文件存储/流量 | 上传文件大小、保留期、下载次数 | 配额、生命周期、去重、直传对象存储 |
| 推送 | APNs/FCM 通常不是主要成本，服务端与运维是成本 | 事件聚合、失败 token 清理 |
| 监控与崩溃 | 事件量和保留时间 | 脱敏采样、自托管优先、分级保留 |
| CI 构建 | 多平台构建频率、macOS runner 时长 | Release 才全矩阵，PR 使用最小验证 |
| 客户支持 | 安装、网络、模型认证和自托管差异 | 安装诊断、日志包、知识库、支持边界 |

### 19.3 容量假设

首批 Beta 以 20～50 个 Workspace、100 台以内设备为容量验证基线。当前 2 vCPU/7.3 GiB 主机适合早期验证和静态文档托管，但不应承担 Windows/macOS/iOS/Android 全平台构建。出现以下任一条件时扩容或拆分：

- CPU 15 分钟平均持续超过 70%；
- 可用内存持续低于 1 GiB 或开始频繁换页；
- 根盘使用超过 75%，预测 30 天内超过 85%；
- API p95 延迟连续 15 分钟超过 1 秒；
- 文件流量影响数据库/API 健康；
- 单实例故障已不满足客户 SLA。

---

## 二十、安全威胁模型与隐私基线

### 20.1 关键资产

- 用户、设备、Node 和 Agent 凭据；
- Workspace 消息、文件和审批记录；
- 本地授权根中的文件；
- 模型 Provider API Key；
- 客户端签名密钥和自动更新私钥；
- 审计记录、备份和恢复凭据。

### 20.2 主要威胁与控制

| 威胁 | 攻击路径 | 必须控制 |
|---|---|---|
| 长期 Token 泄漏 | URL、Referer、日志、截图、崩溃报告 | 短期 UI session、禁止 query token、全链路脱敏 |
| 设备被盗 | 本地凭据被提取 | Keychain/Keystore、安全存储、应用锁、单设备撤销 |
| Agent 冒充 | 伪造 ID 或复用 token | 服务端绑定 Agent/Node/设备，展示不可变身份快照 |
| 任意文件读取 | 绝对路径、符号链接、竞态 | 授权根、relative path、realpath、不可变快照、hash 绑定 |
| 审批绕过 | 通用命令替代专用协议 | capability allowlist、专用状态机、fail closed |
| 推送泄密 | 锁屏显示消息/文件正文 | 推送只带事件 ID 和最小元数据，登录后拉取正文 |
| 恶意深链 | 外部 URL 注入 Workspace/Token | scheme/universal link allowlist、参数 schema、二次确认 |
| 更新供应链攻击 | 更新源或签名密钥被劫持 | 签名验证、不可变 Release、最小权限、SBOM/来源证明 |
| 服务端横向越权 | Workspace ID 枚举 | 每次查询强制成员/角色校验，集成测试覆盖 |
| 备份泄漏 | dump/对象存储暴露 | 加密、独立凭据、最小权限、恢复审计和到期删除 |

### 20.3 数据最小化

- 默认不采集消息正文、文件正文、绝对路径、API Key 和审批敏感匹配片段；
- 审计记录只保留主体、动作、对象 ID、结果、时间和必要的脱敏理由；
- 推送只包含路由所需 ID，不包含可在锁屏泄漏的正文；
- 崩溃和诊断上传前执行本地脱敏；
- 明确保留期：普通运行日志 7～30 天，安全审计按版本/合同配置；
- 提供设备注销、账户数据导出和删除流程。

### 20.4 安全验证清单

按照 OWASP MASVS 思路覆盖存储、加密、认证、网络、平台交互、代码质量和隐私；Electron 按官方 Security Checklist 逐项审计。Release Candidate 必须完成：

1. 静态依赖与秘密扫描；
2. API 越权与会话生命周期测试；
3. Android/iOS 本地存储和日志检查；
4. Electron IPC、导航、新窗口与外部协议检查；
5. 更新包签名与降级/回滚测试；
6. `local_file_request.v1` 路径逃逸、替换、重放和竞态测试；
7. 第三方独立复核或明确记录未完成及接受风险的人。

---

## 二十一、Linux 生产架构、SLO 与灾备

### 21.1 推荐部署拓扑

```text
Cloudflare / DNS
       │ HTTPS
       ▼
Caddy（唯一公网入口）
       ├─ /v1/*, /ready, /health → AgentHub Backend
       └─ /*                     → AgentHub Frontend

AgentHub Backend ── PostgreSQL
       │
       ├─ 文件存储（Beta 可本机卷，正式版建议对象存储）
       ├─ Push Dispatcher（后续）
       └─ 审计/指标/备份
```

生产主机职责限定为运行服务和提供静态文档；桌面/移动多平台构建放在 CI runner。

### 21.2 Beta SLO

| 指标 | Beta 目标 | 正式商业目标候选 |
|---|---:|---:|
| API 月可用性 | 99.5% | 99.9% |
| `/ready` 探测成功率 | 99.9% | 99.95% |
| API p95 延迟（非文件传输） | < 1 秒 | < 500 毫秒 |
| 消息持久化成功率 | > 99.9% | > 99.99% |
| 设备撤销生效 | 下一请求 | 下一请求 |
| RPO | 24 小时 | 1 小时或按合同 |
| RTO | 4 小时 | 1 小时或按合同 |

### 21.3 监控与告警

- 存活：容器状态、`/ready`、数据库健康、Caddy 5xx；
- 性能：请求率、错误率、p50/p95/p99、DB 连接数、慢查询；
- 容量：CPU、内存、Swap、磁盘、数据库和文件卷增长；
- 业务：在线设备、连接失败、配对失败、审批积压、推送失败；
- 安全：连续认证失败、异常 token 刷新、撤销后访问、路径拒绝、限流命中；
- 告警必须有级别、负责人、静默窗口和处理手册，不能只发“服务异常”。

### 21.4 备份策略

| 对象 | 方式 | 频率 | 保留 | 验证 |
|---|---|---|---|---|
| PostgreSQL | `pg_dump` + 加密异机保存 | 每日；正式版可增量/WAL | 7 日 + 4 周 + 3 月 | 每月至少一次恢复演练 |
| 用户文件 | 快照/对象存储版本 | 每日或持续 | 按产品策略 | 随机抽样 hash 校验 |
| 配置 | Git + 加密 secrets 备份 | 每次变更 | 长期 | 新机恢复演练 |
| Release | 不可变制品、签名和 SBOM | 每次发布 | 支持期内 | 安装和签名验证 |

备份成功不等于可恢复。每月在隔离环境执行恢复，记录耗时、缺失项和实际 RPO/RTO。

### 21.5 发布与回滚

1. 以完整 Git SHA 构建不可变镜像；
2. 发布前备份数据库和文件元数据；
3. migration 必须提供兼容窗口，优先 expand/migrate/contract；
4. 先灰度内部 Workspace，再扩大流量；
5. 验证原业务、配对、消息、审批、安全文件和客户端兼容矩阵；
6. 回滚优先切回旧镜像；数据库 destructive migration 不与同一版本同时执行；
7. 每次发布保留变更、风险、验证证据和回滚负责人。

---

## 二十二、质量门禁与验收证据

### 22.1 Definition of Done

每个工作项只有同时满足以下条件才算完成：

- 代码、migration、配置和文档齐全；
- 新行为有自动化测试，既有回归通过；
- 日志和错误信息不包含凭据或敏感正文；
- 对外 API/协议已记录兼容性；
- 实际构建产物已在目标系统运行，而不是只通过源码检查；
- 用户可见功能已通过真实设备或浏览器验证；
- 监控、升级和回滚方法已补充；
- 安全/许可证门禁没有未说明的阻塞项。

### 22.2 发布候选证据包

```text
release-evidence/<version>/
├─ build-manifest.json
├─ checksums.txt
├─ signatures/
├─ sbom/
├─ test-results/
├─ security-scan/
├─ compatibility-matrix.md
├─ migration-and-rollback.md
├─ store-review-notes/
└─ known-risks.md
```

### 22.3 缺陷分级

- **P0：** 数据泄漏、凭据泄漏、远程执行越权、不可恢复数据损坏——立即停止发布；
- **P1：** 登录/配对/消息/审批主链路不可用，或高概率崩溃——发布前必须修复；
- **P2：** 有替代路径但明显影响使用——进入版本风险清单并明确修复日期；
- **P3：** 低影响体验问题——可排入后续迭代。

---

## 二十三、风险登记册

| ID | 风险 | 概率 | 影响 | 触发信号 | Owner | 应对 |
|---|---|---:|---:|---|---|---|
| R-01 | 身份改造影响现有 self-hosted 用户 | 中 | 高 | 旧 Connector 无法加入 | TL | 双协议窗口、迁移测试、能力协商 |
| R-02 | 移动端被认定为网页套壳 | 中 | 高 | 审核反馈 4.2/最低功能 | PO/FE | 推送、扫码、分享、审批、离线恢复作为首发功能 |
| R-03 | 上游快速变化造成长期 Fork 成本 | 高 | 中 | 同步冲突持续增加 | TL | 缩小核心改动面、适配层隔离、定期上游合并 |
| R-04 | 签名/商店账号准备过晚 | 中 | 高 | RC 阶段仍无证书 | PO/OPS | M0 建号，S2 前完成测试签名 |
| R-05 | 第三方依赖许可证阻塞 | 低中 | 高 | SBOM 出现限制性依赖 | SEC | M0 扫描，尽早替换，不到 RC 才处理 |
| R-06 | 当前主机容量不足 | 中 | 中 | p95/磁盘达到阈值 | OPS | 文件外置、数据库调优、扩容计划 |
| R-07 | 推送在中国网络不稳定 | 中 | 中高 | FCM 到达率低 | FE/OPS | 厂商通道评估、应用内补拉、可观测到达率 |
| R-08 | 安全审批过重影响使用 | 中 | 中 | 用户频繁无脑批准 | PO/SEC | 风险分级、默认安全、清晰身份和最小化提示 |
| R-09 | 单人开发周期失控 | 高 | 高 | 连续两个 Sprint 未达目标 | PO | 只做 Windows+Android、冻结范围、外包签名/测试专项 |
| R-10 | 品牌或名称冲突 | 低中 | 高 | 商标/商店检索冲突 | PO | M0 完成检索并准备备选名称 |

风险登记册每周更新；高影响风险未指定 Owner 时，项目不得进入下一门禁。

---

## 二十四、首个 30 天执行计划

### 第 1 周：验证与冻结

- 建立产品分支和 ADR 目录；
- 输出竞品矩阵与 9 名目标用户访谈记录；
- 完成 Android Capacitor 本地 Bundle PoC；
- 冻结 Windows + Android 首发范围；
- 完成品牌候选、应用 ID 和许可证初扫；
- 输出身份/设备 session 数据模型与 API 草案。

### 第 2 周：安全会话

- 先写撤销、过期、重放、越权失败测试；
- 实现 scoped device session 与 refresh rotation；
- 增加设备列表、撤销、审计；
- 清除 URL 长期 Token，保留兼容迁移入口；
- 桌面和 Android 接入安全存储 PoC；
- 做第一次 Go/No-Go 评审并重估工期。

### 第 3 周：Windows 闭环

- Launcher 自有品牌与 Endpoint 设置；
- Connector 版本统一和 capability handshake；
- Windows 干净虚拟机安装、配对、Agent 回复；
- 系统通知点击回到会话；
- 构建签名、更新和回滚测试框架。

### 第 4 周：Android 闭环

- 移动导航、配对、消息、Agent 状态；
- 文件选择、上传下载和系统分享；
- 敏感文件请求审批；
- 前后台、断网和网络切换恢复；
- 产出首个内部 APK 与真实设备测试报告。

30 天结束必须交付可演示的 Windows + Android 真实闭环。若仍停留在静态 UI 或远程 WebView，应触发 No-Go/范围重审。

---

## 二十五、本计划的 GitHub 落地与维护

### 25.1 权威位置

- **仓库：** `zaiyemeiyou404/agent-hub`；
- **计划书：** `docs/plans/2026-10-20-agenthub-mobile-desktop-product-plan.md`；
- **交付方式：** 所有计划修改只进入 feature 分支，由 Pull Request 审核后再由项目负责人决定是否合并；
- **Linear 状态（2026-10-24 恢复）：** 使用既有 WP-01～WP-10 与 T00～T13 跟踪实施；当前范围采用总计划 v3.7、开发清单 v1.2，仓库记录实际代码和可复验证据；不重复建立顶层工作包；
- **完成标准：** 代码、测试、构建、部署或审查证据齐全后，相关工作项才可视为完成。

### 25.2 维护流程

1. 产品范围、架构、身份模型或发布门禁变化时，先同步 Linear 当前计划和仓库对应实施文档；历史研究不自动成为当前交付门槛；
2. 每次修改在 commit/PR 中说明依据、影响、验证命令和未解决风险；
3. 代码实施仍按 WP-01～WP-10 归类，不重复创建同义顶层工作包；
4. M0、M1、RC、GA 门禁必须把测试报告、构建制品或演练记录保存到仓库约定的证据目录；
5. 计划中的“当前已具备”“需要改造”“尚未验证”必须随代码变化同步更新；
6. 2026-10-24 项目负责人要求查看该账号 Linear 并按本机说明开工，现已恢复执行跟踪；任务仅在实际开工后标进行中，验收与复核完成后才标 Done。

### 25.3 信息安全规则

- GitHub 文档、Issue、PR、日志和截图不写入真实 API Key、Workspace Token、Node Token、设备 Token、配对码、密码或连接串；
- 所有敏感值统一写作 `[REDACTED]`；
- 不提交文件正文、凭据值、安全匹配片段或不必要的原始绝对路径；
- 商业、许可证和安全结论保留来源、验证日期和审查责任人；
- Release Evidence 只保存脱敏证据，不以“调试需要”为由降低泄漏门禁。

---

## 二十六、2026-10-20 仓库复核结果

### 26.1 已独立复跑的验证

| 范围 | 命令/方式 | 结果 | 结论 |
|---|---|---:|---|
| Web Workspace 前端 | `cd workspace/frontend && npm test -- --run` | 105 个测试文件、503 个测试全部通过 | 当前 Web 回归基线可用 |
| 安全文件、独立 Node Token、短期 Workspace Session | `pytest -q test_local_file_requests.py test_node_tokens.py test_workspace_session.py` | 77 通过 | 已有安全协议主干真实存在，但不代表产品化缺口已完成 |
| Node API | `pytest -q workspace/backend/tests/test_nodes.py` | 24 通过、2 失败 | 测试仍用共享 Workspace Token 模拟 Node，与独立 Node Token 约束冲突 |
| 推送、设备与通知 | `pytest -q test_push.py test_fcm_client.py test_devices.py test_notify.py` | 82 通过、1 失败 | `kind=help` 审批测试与当前允许类型发生漂移 |
| Agent Connector | `cd packages/agent-connector && npm test` | 2109 通过、1 失败、9 跳过 | OpenCode 二进制发现测试被宿主 PATH 污染，测试环境不够隔离 |
| Electron Launcher 依赖安装 | `cd packages/launcher && npm ci --ignore-scripts --no-audit --no-fund --dry-run` | 失败 | package 与 lockfile 不一致，当前桌面构建不可复现 |

### 26.2 已确认的发布阻断项

1. **Connector 版本漂移：** Connector 源码为 `0.2.196`，Launcher 声明 `0.2.194`，Launcher lockfile 为 `0.2.189`；必须先统一版本、lockfile 和安装包来源。
2. **客户端设备会话缺失：** 尚无 `DeviceSession`、refresh token family、rotation、重放检测和单设备客户端撤销。
3. **Node Token 权限过宽：** 服务端仍保存明文 Node Token，且机器 Token 可进入通用 Workspace 鉴权入口；必须改为 hash 存储和端点级 scope。
4. **桌面凭据不安全：** `safeStorage` 默认关闭并可能静默回退明文；Workspace、SSE、文件和分享链路仍有 URL Token 路径。
5. **移动工程不存在：** 仓库尚无 Capacitor、Android/iOS 原生工程和移动 CI，不能描述为“已有移动基础”。
6. **推送隐私不足：** 服务端 FCM 基础存在，但当前通知可能携带锁屏可见正文；客户端注册、点击、深链和到达回执闭环不存在。
7. **安全文件仍需硬化：** 缺少并发 upload 行锁、解码前请求体上限、失败/过期快照 GC，以及完整公网证据包和泄漏扫描。
8. **发布门禁未全绿：** 当前存在 4 个已复现测试/安装阻断点，任何正式 Beta 或 stable 发布都必须先归零或形成有期限、有责任人的风险接受记录。

### 26.3 当前可信结论

- **已具备：** Web Workspace、Electron Launcher 主框架、Connector、Node 配对、独立 Node Token、安全文件协议主干、FCM 服务端发送基础。
- **需要改造：** 身份与设备会话、Node Token scope/hash、桌面安全存储、URL Token、版本锁定、推送隐私、文件协议并发和生命周期。
- **尚未验证：** Capacitor 真机闭环、Android/iOS CI、桌面正式签名与公证、客户端推送到达/点击、Windows+Android 公网端到端 Beta、完整 SBOM 与第三方法律复核。
- **项目结论：** 仍为“有条件 Go”，但 M1 身份、安全和可复现构建未通过前，不得把桌面或移动包认定为可发布产品。

---

## 参考资料

[1] Capacitor Documentation — https://capacitorjs.com/docs
[2] Capacitor Push Notifications — https://capacitorjs.com/docs/apis/push-notifications
[3] Electron Security Checklist — https://www.electronjs.org/docs/latest/tutorial/security
[4] Apple App Review Guidelines — https://developer.apple.com/app-store/review/guidelines/
[5] Google Play Functionality, Content, and User Experience — https://support.google.com/googleplay/android-developer/answer/9898783
[6] Android App Signing — https://developer.android.com/studio/publish/app-signing
[7] Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0
[8] SPDX Specifications — https://spdx.dev/use/specifications/
[9] CISA Software Bill of Materials — https://www.cisa.gov/sbom
[10] OWASP Mobile Application Security Verification Standard — https://mas.owasp.org/MASVS/
[11] SLSA Specification — https://slsa.dev/spec/v1.2/
