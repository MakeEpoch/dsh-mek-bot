# dsh-mek-bot

[English](README.md) · [上游 DS-Bot](https://github.com/Fei2411/DS-Bot)

MakeEpoch 的 DS-Bot 集成插件。**DSH 侧边栏只增加一个 Bot 入口，点开使用 DS-Bot 原有 UI。** 不重写新建 Bot、设置、聊天或群聊界面，不修改 DSH 源码。

![DS-Bot 集成界面](docs/images/mek-bot.png)

## 使用

点击 DSH 侧边栏的 **Bot**，进入原版 DS-Bot 界面。在里面创建 Bot、选择模型、编辑职责、管理记忆或建立群聊；点击外层工作区或会话，即可继续使用 DSH 原有界面。

初次打开创建一个主 Bot。插件默认不主动调用模型发欢迎消息，选择模型后可自行开始聊天。Bot 使用当前 DSH 的模型与权限，模型调用正常消耗你所配置服务商的额度。

## 安装

已验证 DSH `0.2.2-alpha.2`、Node.js 24。包名与仓库名均为 `dsh-mek-bot`。

从本仓库构建：

```sh
cd ds-bot
npm ci
npm run build
npm pack --ignore-scripts
# 从打包文件安装到 Web profile，随后启用该 bundle 并重启 DSH
# 不要同时启用原 ds-bot bundle
dsh plugin --profile web add -w ./dsh-mek-bot-0.1.0.tgz
```

生产环境使用打包安装，禁止 `link:`、符号链接或直连开发源码。DSH profile 保持 `autoInstallPeers: false`；宿主 API 由 DSH 插件加载器提供，不能额外安装另一份 Cordis、tools、scope 或 LLM 核心。

## 数据与配置

团队数据默认保存在 `DSH_HOME/mek-bot`，不会读写原有 `DSH_HOME/bot` 团队目录。聊天历史仍由 DSH 的 Session 服务保存。卸载插件不会删除这些数据。

可以在当前用户的 `cordis.patch.yml` 中设置插件配置，例如：

```yaml
- id: mek-bot
  config:
    mainName: 小音
    mainRole: 主助手
```

不改动全局网页搜索、默认预设、主题或原生聊天设置。普通 DSH 会话不会获得 Bot 团队工具。Bot 内页复用上游完整插件 UI，并在独立文档中运行，避免其样式和快捷键接管外层 DSH。

## 开发与上游合并

源码保留上游目录与公开 Git 历史；基线记录在 [.makeepoch/upstream.json](.makeepoch/upstream.json)。主要适配代码是 `ds-bot/mek.js`、`ds-bot/src/client/mek/index.jsx` 和工具注册辅助函数；原 UI 组件保留在原位；内嵌模式仅关闭菜单和设置中的 Agent 切换。

```sh
cd ds-bot
npm ci
npm run harness
npm run build
npm test
node scripts/build-client.mjs --check
npm run lint
```

详见 [集成边界与合并流程](docs/makeepoch-integration.md)。保留的上游桌面应用、Docker 与发布脚本不是本插件的发布入口；上游原文见 [README.upstream.md](README.upstream.md)。

## 许可证

继承上游 **Apache-2.0**，保留 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。这是社区下游集成，与 DeepSeek 官方无隶属关系。
