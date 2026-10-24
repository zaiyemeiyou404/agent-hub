# 模块边界入口

本文件是规范入口，不另建一套接口。表写入归属、现有路由和合成样例以 [module-contracts.md](module-contracts.md) 为唯一正文。资源限额以 [implementation-baseline.md](implementation-baseline.md) 的容量表为准。许可证和最小发行集合以 [third-party-inventory.md](third-party-inventory.md) 为准。

## 自己维护的范围

首版核心：Workspace 后端、共享前端、Windows Host/Launcher、Connector 核心，以及 T07 选定后的 Android Host。兼容层仍包括 backend 镜像里的 `openagents/` 与 `cloud_providers/`；T11 按实际引用决定可否移出，本轮不删除。

可选、默认不进首版最小包：SDK Studio、营销站、示例和研究材料、未选 Agent 插件。浏览器、隧道和技能下载不是首版必需能力；启用前必须显示真实连接对象。

## 本轮不做的改名

tracked 应用标识仍是 `packages/launcher/package.json` 的 `com.openagents.launcher`。自用开发合同使用 `com.zaiyemeiyou.aghub`。2026-10-24 在 `packages/`、`workspace/`、`sdk/` 的 json/ts/js/mjs/yml/xml/gradle/plist/kt 中核对：该自用标识没有第二条声明，因此没有同名 tracked 冲突。Launcher/Connector 的实际包身份改造归 T02，T00 不为此改名。

## 本地配置合同

T01 按同一语义实现，本文件不提前改运行时代码：

- `apiBase` 与 `authBase` 的本地开发值是 `http://127.0.0.1:18000`。
- `webBase` 的本地开发值是 `http://127.0.0.1:13000`。
- 只有明确的开发模式允许这些本机 HTTP 地址。正式远端必须由用户显式配置 HTTPS。
- 缺少必需地址时返回 `configuration_required`。不猜测域名，也不回退官方主机。
- `registry` 与 `update` 默认关闭。Agent 目录优先使用随包本地数据。
