# 归属与发行身份登记

2026-10-24；只登记事实与待确认责任，不保管凭据。

| 项目 | 当前事实 | 交接/冻结条件 |
| --- | --- | --- |
| 源码 | 本机 origin `zaiyemeiyou404/agent-hub`；保留 OpenAgents 提交历史与上游 remote | T11 检查实际仓库管理员、规则、Actions、发布权限；fork 标志不证明独立性 |
| 自有服务/域名 | 本轮仅 127.0.0.1:13000/18000；未核实正式域名所有权 | T01 由所有者确认正式/测试来源，账户/模型配置均按服务隔离 |
| 应用标识 | 当前 Launcher `com.openagents.launcher`；本工作树无 tracked Android 源码 | 计划默认 `com.zaiyemeiyou.aghub`，本机 tracked 源码未发现已有声明；外部商店/证书冲突未查，暂不声称已冻结 |
| Connector 包名 | 当前 `@openagents-org/agent-launcher` 0.2.196 | T02 选择并验证可控制的包/随包核心，不假设拥有上游 npm scope |
| Windows 发行 | 当前配置含 NSIS/MSI/portable，多种产物及官方 feed | T09 选择一种首版安装格式，确认自有发布入口与升级行为 |
| Android | 原工作树有未跟踪 apps/ 和 dist-android/ 构建残留 | T07 先查源代码、许可和可构建性；残留产物不是已选路线或 APK 实机通过证据 |
| 签名 | 上游 Launcher 存在 macOS identity、公证配置；自有 Windows/Android 签名未核实 | 上游 identity 不转移所有权；所有者确认保管人、恢复方案与签名来源，私钥不进入仓库/Linear |
| 来源/许可证 | 根 Apache-2.0，Launcher/Connector/Studio package 声明 MIT | 逐组件保留版权/来源/修改说明，详见 third-party-inventory.md |
| 安全与支持 | 当前 SECURITY.md 为历史上游文件 | T11/T13 指定自有安全报告/支持入口及维护责任后再对外发行 |

本轮执行者 Codex 仅完成本地核验与基线准备；A/B/C 为计划角色，不伪造三位开发者、复核人或发行账号。未授权部署、发布、签名、生产数据库操作。
