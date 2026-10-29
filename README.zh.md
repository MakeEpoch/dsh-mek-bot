# dsh-mek-bot

[English](README.md) · [上游 DS-Bot](https://github.com/Fei2411/DS-Bot)

MakeEpoch 的 DS-Bot 集成插件。DSH 侧边栏只增加一个 **Bot** 入口，在当前页面使用 DS-Bot 的原生 React 组件，不使用 iframe 启动另一套 DSH。

![DSH 中的原生 Bot 界面；本地假模型演示](docs/images/mek-bot.png)

## 使用

Bot 内部保留原有的**新建、已有 Bot、群聊、可选的 DSH Agent**，支持侧栏折叠和展开。删除当前 Bot 或群聊后自动回到可用对话，关闭相应详情与过期弹层。点击对话顶部的名称可以打开详情，调整职责、模型、权限或记忆。底部菜单只保留用量、连接器、Bot 设置；移除 Bot 界面的退出、定时任务和 Agent 模式切换。DSH 原有的会话、插件和自动化界面仍可正常使用。

Bot 是有独立身份、职责、模型与记忆的长期助手，可以相互委派工作、建立群聊。Bot 内的 DSH Agent 入口通过 DSH 原有的工作区导航打开普通会话，不在外层增加另一个 Agent 菜单。

模型、密钥和权限来自你已有的 DSH 配置。新 Bot 默认不会主动调用模型发欢迎消息，选择模型后自行开始聊天。模型调用使用你所配置服务商的额度。

## 任务留在最初发起的 Bot

通过主 Bot 委派的任务，结果和问题都回到主 Bot。主 Bot 自行判断常规选择，必要时在当前对话询问你，回答后恢复同一个子任务。你直接找其他 Bot 的对话仍保持独立。委派不会再要求你去子 Bot 的窗口继续交流，群聊发帖也会自动请求回报。

子任务返回后等待验收，负责人可以要求同一任务返工、检查验证证据，未解决的工作和问题会阻止任务被接受。负责人对话中的可折叠任务摘要显示执行者、问题、结果和取消操作。真实工具授权和安全凭据卡也显示在这里，Bot 不能替用户批准操作，也看不到凭据值。

任务归属、待决问题和待发送结果保存在 `mek-bot/state.json`。重启后保留等待状态，送达情况不确定的消息会先核对收件箱及持久历史；历史不可读时保留“不确定”，不盲目重做。任务归属从新的委派开始生效，不会擅自重新归类旧的上游委派。协调层只由 `mek.js` 安装，保留的上游入口仍采用原有行为。

## 安装

已验证 DSH **0.2.2-alpha.2**、Node.js 24 和当前 Chromium。浏览器需要支持 CSS `@scope`。

```sh
cd ds-bot
npm ci
npm run build
npm pack --ignore-scripts
dsh plugin --profile web add -w ./dsh-mek-bot-0.1.3.tgz
```

启用 bundle 后重启 DSH，不要同时启用原 `ds-bot` bundle。生产安装必须使用打包文件，禁止 `link:`、符号链接或直连开发源码。profile 保持 `autoInstallPeers: false`；宿主 API 由 DSH 加载器提供，不能安装第二份 Cordis、scope、tools 或 LLM 核心。

## 数据与配置

团队数据默认在 `DSH_HOME/mek-bot`，与上游的 `DSH_HOME/bot` 分开；聊天历史仍由 DSH Session 服务保存，卸载不会删除这些数据。可在当前用户的 `cordis.patch.yml` 中设置：

```yaml
- id: mek-bot
  config:
    mainName: 小音
    mainRole: 主助手
```

插件不改 DSH 源码、全局搜索、预设或原生聊天设置。团队工具只对团队拥有的会话生效。Bot 的 CSS、弹窗、DOM 读取与坐标限定在自己的面板内，不替换浏览器全局对象，不重复加载其他 DSH 插件。群聊记录从持久化 Session 日志分页读取，不依赖给模型看的有限上下文日志。

## 开发与合并上游

保留上游目录、Apache 许可证与公开 Git 历史，基线见 [.makeepoch/upstream.json](.makeepoch/upstream.json)。主要适配位于 `ds-bot/mek.js`、`ds-bot/src/client/mek/` 和团队工具注册辅助函数；原有共享 UI 保持原位，复用组件及控制器。

```sh
cd ds-bot
npm ci
npm run harness
npm run build
npm test
node scripts/build-client.mjs --check
npm run lint
```

详见 [集成边界与合并流程](docs/makeepoch-integration.md)。开发依赖独立安装在 `ds-bot/dev/harness`。保留的桌面、Docker 代码是上游参考资料，不是本插件的发布入口；原文见 [README.upstream.md](README.upstream.md)。

## 许可证

继承上游 **Apache-2.0**，保留 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。本项目是独立社区集成，与 DeepSeek 官方无隶属关系。
