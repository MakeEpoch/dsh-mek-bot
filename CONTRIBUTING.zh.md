# 参与 dsh-mek-bot 开发

[English](CONTRIBUTING.md) | 中文

感谢参与。本文说明团队怎么协作、怎么搭环境、怎么测试改动，以及改动必须遵守的规则。插件做什么、用户怎么安装，见 [README.md](README.md)。

## MakeEpoch 插件

本仓库以根目录交付原生 DSH 插件 `dsh-mek-bot`。产品定位、集成和测试分别见 [README](README.md)、[集成说明](docs/makeepoch-integration.md)和 [UI 测试方案](docs/dev/mek-ui-testing.md)。用户可见行为有变化时同步更新对应文档，并记录实际测试环境。

## 谁可以提 Pull Request

本仓库的协作者直接在这里推分支，向 `dev` 提 Pull Request（见[协作方式](#协作方式)）。目前只有协作者能提 Pull Request。如果你不是协作者，发现 bug 请开 Issue（见[报告问题](#报告问题)），提问或建议请到 [Discussions](https://github.com/MakeEpoch/dsh-mek-bot/discussions)。

## 最重要的规则

1. **基于 DSH 构建，不改 DSH。** Bot 功能是 DSH 插件：只用 DSH 有文档的插件接口（Cordis 服务、插件客户端入口、profile patch）。桌面应用只通过 DSH 有文档的入口启动 DSH（`@deepseek-ai/dsh/profile-boot`、`dsh` 命令）。不修改 DeepSeek Harness，不依赖 DSH 安装目录里的文件。功能需要 DSH 没有提供的能力时，先在这里开 Issue；修复可能应该放在 DSH 里。
2. **Bot 的工作跑在 DSH Session 里。** Bot 的身份不变，工作跑在 DSH Session 里：私聊一条、每个群各一条，上下文快满时换一条新的。每个回合都走 DSH 正常的 agent 循环、工具和模型路由。不要另加一套 agent 运行时。
3. **任何地方都不放真实密钥。** 不要提交 API key、token、cookie、`DSH_HOME` 目录、日志，或带个人信息的截图。测试和测试台用脚本化的模拟模型，不需要密钥。
4. **只用原创素材。** 不要从其他产品或网站复制代码、文字、图标、logo 或其他图形。唯一例外是与 Apache 2.0 兼容许可的代码：注明出处，并把它的声明加进 `NOTICE` 文件。
5. **每个改动都要测试。** 每个改动都要跑单元测试和客户端检查（见[测试改动](#测试改动)）。

## 协作方式

团队里谁都可以做任何工作：分诊、修 bug、做功能、改界面、写文档。只有一部分决定归维护者：产品方向、改动已定的设计、这些规则、发版和架构。需要这类决定的 Issue 和 Pull Request 带 `maintainer` 标签；开工前先等维护者回复。DS Bot 要做成什么，见 [docs/vision.zh.md](docs/vision.zh.md)；已定的设计在 [docs/plans/](docs/plans/)。拿不准是 bug 还是设计如此时，先查这两处，再在 Issue 里问。

### 分支

| 分支 | 用途 | 谁来合并 |
|---|---|---|
| `dev` | 集成分支。所有修复和功能先进这里 | 所有协作者，CI 通过即可 |
| `main` | 只放已发版的代码。维护者发版时把 `dev` 合进来，或合入热修 | 维护者 |
| `fix/<Issue 号>-<短名>`、`feat/<Issue 号>-<短名>`、`docs/<短名>`、`chore/<短名>` | 你的工作分支。从最新的 `dev` 切出 | — |

- 分支名不要以 `dev/` 开头。有 `dev` 分支时，Git 建不了 `dev/<名字>`。
- 同步分支用 `git merge dev`（热修分支用 `git merge main`）。已推送的分支不要 rebase，也不要强推。
- 默认分支是 `main`，所以 GitHub 新建 Pull Request 时默认的 base 是 `main`。请改成 `dev`。

### Issue

1. **分诊。** 给每个新 Issue 打类型、优先级和领域标签（见[标签](#标签)）。每个 Issue 只有一个优先级标签。具体步骤和列出待分诊 Issue 的脚本见 [.agents/skills/issue-triage/](.agents/skills/issue-triage/SKILL.md)，AI 也可以照着做。
   - 是提问（怎么装、怎么用）：选 **Convert to discussion**，转到 Q&A 分类。
   - 信息不够，找不到原因：加 `needs-info`，写清楚还缺什么。说明 14 天没有回复就关闭。
   - 原因在 DSH 或其他插件：加 `upstream`，并链接到应该处理它的地方。
   - 和已有的 Open Issue 相同：加 `duplicate`，链接原 Issue，关闭这一条。
2. **认领。** 开工前把 Issue 指派（Assign）给自己，并在 Issue 里写「我来做」，避免两个人做同一件事。已经有人认领的 Issue 不要抢；想接手先在 Issue 里问。
3. **功能。** 新想法先在 Discussions（Ideas）里讨论。维护者认可后，再开成带 `enhancement` 标签的 Issue。做功能前，先在 Issue 里写几句打算怎么做。大功能在同一个 Pull Request 里附上设计说明 `docs/plans/<日期>-<主题>.md`。
4. **有证据才关。** 关闭 Issue 时，附上修复它的 Pull Request 或提交、它重复的 Issue，或不修的原因。评论用 Issue 本身的语言。

### 标签

| 维度 | 标签 |
|---|---|
| 类型 | `bug` · `enhancement` · `documentation` |
| 优先级 | `P0` 崩溃、丢数据或无法使用 · `P1` 影响日常使用 · `P2` 一般缺陷或功能 · `P3` 建议或窄场景 |
| 领域 | `area/host` 服务端（`index.js`、`src/host/`）· `area/client` 界面（`src/client/`）· `area/group` 群聊、@ 提及、Bot 之间的消息 · `area/memory` 记忆、对话分段、上下文 · `area/browser` Bot 浏览器、读网页、网页搜索 · `area/build` CI、发版、脚本、测试台 · `area/docs` |
| 流程 | `maintainer` 等维护者 · `needs-info` 等报告人 · `upstream` 原因在 DSH 或其他插件 · `duplicate` · `auto-found` 自动测试发现 |

跨多个领域或不属于任何领域的 Issue，不打领域标签。

### Pull Request

1. 向 `dev` 提 Pull Request，按模板填写。用 `Fixes #<号>` 关联 Issue；修 bug 的 PR 一定要写明修的是哪个 bug。从 fork 提 Pull Request 时，请保持勾选 **Allow edits from maintainers**，方便维护者在合并前解决冲突或做小调整。
2. 在模板的 **Changelog** 一栏写一句用户能看到的变化，没有就写「无」。不要改 `CHANGELOG.md`：维护者发版时根据这些句子统一写。
3. CI 通过后，自己用 **Create a merge commit** 合并，然后删除分支。不强制审查；想让人看一眼，在 Pull Request 里 @ 队友。
4. 合进 `dev` 的修复不会关闭对应的 Issue：`Fixes #<号>` 只在合入默认分支时生效。Issue 会一直开着，直到发版，意思是「已在 `dev` 修复，尚未发版」。

一个 Pull Request 只对应一个 Issue。大改动拆成多个 Pull Request。

### 合并冲突

- **`client.js`**：不要手工解决。先解决 `src/client/` 里的冲突，再在仓库根目录 里运行 `npm run build`，提交新生成的 `client.js`。
- **`CHANGELOG.md`**：Pull Request 不改它，所以不应该冲突。如果冲突了，两边都保留。

### 发版

发布前用隔离 DSH profile 执行[插件发版检查](docs/dev/release-checklist.md)。

## 搭建环境和测试

使用 Node.js 24，在 `MakeEpoch/dsh-mek-bot` 仓库根目录执行。

```sh
npm ci
npm run harness
npm run build
npm test
node scripts/build-client.mjs --check
npm run lint
```

安装 DSH CLI 和 pnpm 后，`npm run check -- --only smoke` 会使用打好的插件、独立 profile 和本地模拟模型进行冒烟检查。浏览器交互见 [UI 测试方案](docs/dev/mek-ui-testing.md)。正常运行时，`@deepseek-ai/*` 对等依赖由 DSH 宿主提供。

## 目录结构

- `mek.js` 和 `cordis.patch.yml` 分别是插件入口和 DSH 组合包配置。
- `src/host/` 存放 Bot 运行时、团队工具和 DSH 集成。
- `src/client/` 存放原生 Bot 界面和共享聊天组件。使用 `npm run build` 生成需要提交的 `client.js`。
- `test/` 和 `dev/` 存放单元测试、DSH 测试夹具和隔离冒烟脚本。

## 写改动

- 一个改动只做一件事。
- 不要手改 `client.js`。改 `src/client/`，运行 `npm run build`，两者一起提交。
- 在 `src/client/` 里，颜色用 `--bt-*` 变量，圆角只用 4、6、8、10、12、16、18、20、22、999px 和 50% 这几档，弹簧用 `motion.js` 里的。有单元测试检查这三项。测试之前就写成的地方列在 `test/style-debt.json` 里，这份清单只减不增。改掉一处后，运行 `node scripts/style-debt.mjs --write` 更新清单。
- 跟随改动周围代码的风格。只有当代码本身看不出原因时才写注释。
- 提交说明用英文。标题简短，用祈使句（如 "Keep group replies visible"），在正文里写原因。
- 提交的作者是做出改动的人。用 AI 工具辅助时，不要把它加为作者，也不要加 `Co-authored-by` 行；在工具里关掉这个设置。
- 不要改 [CHANGELOG.md](CHANGELOG.md)。把用户能看到的变化写在 Pull Request 的 Changelog 一栏。

## 报告问题

最简单的方式是在 DS Bot 里：打开 **设置 → 反馈**，写下发生了什么，选 **在 GitHub 上报告**。它会新开一个 Issue，DS Bot 和 DSH 版本、系统、模型和最近的错误都已填好。**复制** 会把同样的内容放进剪贴板，**下载** 会保存完整的错误日志（`<DSH_HOME>/bot/logs/diagnostics.jsonl`）。

手动开 Issue 时，请写上：

- DSH 版本（DSH Desktop 或 `@deepseek-ai/dsh`）、操作系统，以及用的是 DSH Desktop 还是 DSH Web。
- DS Bot 的安装方式（npm、发布文件、Git 地址或命令行）和版本。
- 你做了什么、期望什么、实际发生了什么，报错请贴原文。
- 一张整窗截图，包含聊天和报错。
- 能让问题再次出现的步骤。

DS Bot 会从诊断信息里去掉 API key、token、保存的密钥和你的用户目录。发出前请读一遍，并去掉截图里的个人信息。

安全问题不要开公开 Issue。请在仓库的 **Security** 页使用 **Report a vulnerability**。

Issue 只用来报告 bug。提问、想法和功能建议请发到 [Discussions](https://github.com/MakeEpoch/dsh-mek-bot/discussions)。维护者认可的想法会开成 Issue。

## 许可

DS Bot 使用 [Apache License 2.0](LICENSE)。提交贡献即表示你同意按同一许可授权，如该许可第 5 条所述。
