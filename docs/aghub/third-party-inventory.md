# 组件与许可证声明盘点

本表记录本地源码中的声明，不替代逐文件权属复核。根 LICENSE 的 Apache-2.0 与 JS 子包 MIT 声明保持原样，没有统一改许可证。

| 组件 | 声明来源 | 发行范围与待处理 |
| --- | --- | --- |
| 根 Python 包 / SDK | LICENSE、pyproject.toml：Apache-2.0；保留 OpenAgents 作者历史 | 自有发行须带 LICENSE、适用的版权/NOTICE 与修改说明；实际文件声明继续核对 |
| Launcher | packages/launcher/package.json：MIT，OpenAgents 作者/仓库元数据 | 首版核心；核对子包 LICENSE 和逐文件归属，保留来源并更换自有应用/发布身份 |
| Connector | packages/agent-connector/package.json：MIT，OpenAgents 作者 | 首版核心；保留许可文本、原版权及 fork 修改说明，自有包名不改变原代码权属 |
| Workspace frontend | package.json 无 license 字段；`workspace/frontend` 无 LICENSE；2026-10-24 对 `*.ts`/`*.tsx`/`*.js`/`*.md` 未找到 SPDX 或 Copyright 头 | 首版核心。根 LICENSE 为 Apache-2.0，但不能据此完成文件级权属复核，也不能改成邻近包的 MIT |
| Workspace backend | 根仓库/LICENSE；生产依赖单独约束 | 首版核心；服务端 Python 依赖的许可证须由准确安装集合生成清单 |
| SDK Studio | sdk/studio/package.json：MIT | 首版最小包暂不包含；需启用时再审查实际分发集合 |
| JS/Python 间接依赖 | 各 package-lock、requirements.production.lock，哈希见 baseline-snapshot.json | 未生成完整 SBOM，不能声称所有第三方权利已复核。2026-10-24 按现有 lock 安装：Python 来自 pypi.org，75 条 lock 版本一致；npm 解析地址除 `qrcode.react@4.2.0` 为 `registry.npmmirror.com` 外均为 `registry.npmjs.org`。没有批量升级 |
| 图标/字体/截图/音效 | assets、public、字体包与上游素材 | 单独核验来源与许可；商标、官方账号、签名不随源码许可转移 |
| Electron/Node/Python/Postgres/JDK/Android SDK/Gradle | 工具链与运行依赖 | T09/T11 记录准确工具版本和产物溯源；构建下载地址见出站清单 |

正式最小集合：后端 app/已需迁移文件/内置协议与 registry，Workspace 共享前端，Windows Host/Launcher，自有 Connector 核心，T07 选定的 Android Host。实际 backend Dockerfile 还复制 openagents/、cloud_providers/ 等兼容实现，不能现在删除；T11 按引用确定可选边界。SDK Studio、营销站、示例/研究材料、未选 Agent 插件不默认打进首版产品。T09 从实际同批产物生成最终包含清单、依赖版本、哈希及必要许可文件。

2026-10-24 的发行身份决定不改变上表许可证：签名责任归口 zaiyemeiyou404，材料约定放在仓库外 `G:\CodexData\aghub\signing`，当前没有密钥或证书。自用开发合同标识是 `com.zaiyemeiyou.aghub`，tracked 包身份仍是 `com.openagents.launcher`，改造归 T02。Windows 未签名只覆盖受控本地开发产物，不是已完成的安装包验收。
