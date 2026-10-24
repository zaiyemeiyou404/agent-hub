# 归属与发行身份登记

2026-10-24；只登记事实与待确认责任，不保管凭据。

| 项目 | 当前事实 | 交接/冻结条件 |
| --- | --- | --- |
| 源码 | 本机 origin `zaiyemeiyou404/agent-hub`；保留 OpenAgents 提交历史与上游 remote | T11 检查实际仓库管理员、规则、Actions、发布权限；fork 标志不证明独立性 |
| 自有服务/域名 | 本地开发合同：apiBase/authBase `http://127.0.0.1:18000`，webBase `http://127.0.0.1:13000`。正式远端域名所有权未核实 | 正式 HTTPS 由用户显式配置。缺失为 `configuration_required`。不猜测域名，不回退官方 |
| 应用标识 | 当前 Launcher `com.openagents.launcher`；本工作树无 tracked Android 源码。自用开发合同 `com.zaiyemeiyou.aghub` 在 packages/workspace/sdk 源码中没有第二条声明 | 本地没有同名 tracked 冲突。实际身份改造归 T02。外部商店/证书未查，不宣称已获得注册资格 |
| Connector 包名 | 当前 `@openagents-org/agent-launcher` 0.2.196 | T02 选择并验证可控制的包/随包核心，不假设拥有上游 npm scope |
| Windows 发行 | 当前配置含 NSIS/MSI/portable，多种产物及官方 feed | T09 选择一种首版安装格式，确认自有发布入口与升级行为 |
| Android | 原工作树有未跟踪 apps/ 和 dist-android/ 构建残留 | T07 先查源代码、许可和可构建性；残留产物不是已选路线或 APK 实机通过证据 |
| 签名 | 上游 Launcher 存在 macOS identity、公证配置。自有签名责任归口用户 zaiyemeiyou404。约定仓库外目录 `G:\CodexData\aghub\signing`。当前没有创建该目录，也没有生成密钥或证书 | 上游 identity 不转移所有权。Windows 先允许未签名的受控本地开发产物。Android 自有签名和同签名升级在 T07/T09 验证。私钥不进入仓库/Linear |
| 来源/许可证 | 根 Apache-2.0，Launcher/Connector/Studio package 声明 MIT | 逐组件保留版权/来源/修改说明，详见 third-party-inventory.md |
| 安全与支持 | 当前 SECURITY.md 为历史上游文件 | T11/T13 指定自有安全报告/支持入口及维护责任后再对外发行 |

本轮执行者仅完成本地核验与基线准备；A/B/C 为计划角色，不伪造三位开发者、复核人或发行账号。未授权部署、发布、签名、生产数据库操作。

2026-10-24 续验时 tracked 应用标识仍是 `com.openagents.launcher`，自用标识尚未写入包配置。原仓库未跟踪 Android 目录保持原样，不作为已选 Android 工程。

同日未认证 GitHub API 读到 origin 是公开仓库，默认分支 `develop`。3 个 workflow 为 active，12 个为 `disabled_manually`。actions permissions 返回 401，job logs 返回 403，所以发布、镜像和部署凭据是否存在仍未核实。

同日所有者授权后的决定已写入上表：签名归口 zaiyemeiyou404，本地地址使用回环合同，自用标识先完成本地冲突核对。公共商店/证书注册和正式域名所有权仍未验证。AI 技术复核不代替另一位开发者的合并/发行人审。
