# dsh-mek-bot

**dsh-mek-bot 是 DeepSeek Harness（DSH）里的原生多 Bot 协作插件。** 在已有 DSH 工作区，通过 Bot 面板管理长期助手、群聊、任务委派和验收。模型、会话、工具与权限沿用宿主配置。

本项目派生自 [DS-Bot](https://github.com/Fei2411/DS-Bot)，大量复用其长期 Bot、记忆、群聊、委派和聊天组件。上游以 DSH 为运行底座，提供独立的 Bot 产品与插件入口。dsh-mek-bot 以 DSH 工作区内的一种界面交付，重点是原生集成和负责人交付流程。[详细对照](docs/upstream-comparison.md)

## 安装

先在 DSH 中配置至少一个可用模型。然后在插件管理器添加 `github:MakeEpoch/dsh-mek-bot#main`，或在终端安装到 Web profile。

```sh
dsh plugin --profile web add -w 'github:MakeEpoch/dsh-mek-bot#main'
```

同一 profile 只启用一个 Bot 组合包，并将 `autoInstallPeers` 保持为 `false`，由 DSH 提供宿主依赖。

组合包内含可选的 [MEK Timeline](docs/configuration.md#启用-bot-内嵌时间线)。启用后，私聊和群聊可在 Bot 右侧打开原生时间线。

<details>
<summary>从本地源码构建和安装</summary>

在仓库根目录运行。

```sh
npm ci
npm run build
package=$(npm pack --ignore-scripts --silent)
dsh plugin --profile web add -w "./$package"
```

</details>

## 快速上手

1. 在 DSH 左侧打开 **Bot**，进入主 Bot 的对话。
2. 通过 Bot 菜单新建成员，为每个成员设置名字、职责、模型和工作目录。常用成员和群聊可以收藏到顶部。
3. 试着对主 Bot 说“请让 Writer 起草说明，让 Reviewer 检查遗漏，最后把结论发回这里”。在会话的 **任务** 页查看派工、待决问题和验收进度。 [团队协作指南](docs/team-workflows.md)

## 工作原理

**Bot 是长期身份，DSH Session 是一次对话或一段工作使用的执行上下文。** 同一个 Bot 有自己的私聊，可以在多个群里分别工作。上下文需要换段时，插件把同一个 Bot 或群聊指向新的 Session，旧段仍可查阅。

1. **打开 Bot 面板。** 插件通过 DSH 的原生槽位注册侧栏入口和主面板。顶部会话列表根据 Bot 或群聊定位当前 Session，面板通过 Bot API 发送消息、读取状态并接收更新。见[原生界面入口](src/client/mek/index.jsx)。
2. **在 DSH 中执行。** Bot 的模型、工具调用、权限确认和会话生命周期由 DSH 处理。插件提供 Bot 的角色、记忆和团队关系，并在团队 Session 内注册协作工具。聊天记录由 DSH 保存，队伍、Bot 身份以及派工和验收关系保存在插件的团队状态中。见[运行时入口](mek.js)和[集成边界](docs/makeepoch-integration.md)。
3. **沿原路交付。** 用户最初联系的 Bot 持有主任务。它可以通过 `message_bot` 让其他 Bot 在各自的 DSH Session 中执行。执行中的问题、结果和证据回到负责人，负责人可以答疑、返工或验收，最后在原对话中向用户交付。见[任务协调实现](src/host/mek-coordination.js)。

```mermaid
flowchart LR
  User["用户 · Bot 面板"] -->|提出任务| Owner["负责人 Bot · DSH Session"]
  Owner -->|委派| Worker["执行 Bot · DSH Session"]
  Worker -->|问题、结果和证据| Owner
  Owner -->|验收后交付| User
```

## 文档

- [Bot 面板使用指南](docs/usage.md)
- [任务与团队协作](docs/team-workflows.md)
- [配置、权限与数据](docs/configuration.md)
- [微信接入](docs/wechatpad.md)
- [DSH 集成与开发](docs/makeepoch-integration.md) · [贡献指南](CONTRIBUTING.zh.md)
- [与上游 DS-Bot 的区别](docs/upstream-comparison.md) · [上游合并与移植记录](docs/fork-vs-upstream.md)

我们持续参考上游的设计，优先复用合适的 DSH 公开能力，也会选择性移植适合 MEK 的实现。

## 许可证

本项目由社区独立维护，采用 [Apache-2.0](LICENSE) 许可。原作与第三方代码归属见 [NOTICE](NOTICE)。
