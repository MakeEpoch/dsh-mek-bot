# 下游 fork 与上游 DS-Bot 的差异与合并参考

本文回答一个问题：**下次合并上游时，哪些是我们的、不能丢；哪些是上游的、值得吸收；哪些名字相同但实现不同、最容易合错。**

- 上游：`Fei2411/DS-Bot`（`upstream` 远端），基线记录在 [.makeepoch/upstream.json](../.makeepoch/upstream.json)
- 下游：`MakeEpoch/dsh-mek-bot`（`origin` 远端），只保留 **DSH 插件** 这一种形态
- 集成边界的技术细节见 [makeepoch-integration.md](makeepoch-integration.md)
- **状态说明**：本文基于 2026-10-31 合并 v0.2.4 的静态复核与一次实测（见 §6）。§3 是**本次合并的候选解法**，不是下一次升级的无条件规则；每次都要按当时的代码和测试重新判定。

## 0. 定位差异（一切差异的根源）

| | 上游 DS-Bot | 我们 dsh-mek-bot |
|---|---|---|
| 产品形态 | 独立应用（`app/` 桌面 + `mobile/` 移动）+ 插件 | 只做 DSH 插件 |
| 界面接入 | `src/client/index.js` 接管全局 shell | `src/client/mek/index.jsx` 走公开 slots API，原生组件渲染 |
| 安装包 | `ds-bot` | `dsh-mek-bot`，入口 `mek.js` |
| DSH 版本跟踪 | `0.2.1-rc.4` | `0.2.2-alpha.2`（`dev/harness/package.json` pin） |

结论：**上游把"能跑在更多地方"当目标，我们把"在 DSH 里长得像原生功能"当目标。** 凡是让插件更"独立应用化"的上游改动，可以吸收，但不改变我们的接入方式。

## 1. 下游差异与需保留的体验

分两类看，别混在一起判断。

### 1.1 用户可见的体验（合并时优先保住）

| 体验 | 主要文件 | 说明 |
|---|---|---|
| 单一边栏入口 + 原生面板 | `src/client/mek/index.jsx`、`mek/view.jsx`、`mek/header.jsx` | 无 iframe、无第二个 DSH、无外层 Agent 快捷方式 |
| 任务所有权与协作 | `src/host/mek-coordination.js` + `mek/tasks.jsx` | 原会话持有、挂起决策、结构化结果、修订、验收、取消 |
| 图片输入 | `app/ui/src/image-input.js`、`host/channel.js`、`host/parts.js` | 粘贴/拖拽发图、附件回读。**仅确认代码与测试存在，尚未与上游同类能力做对比** |
| 导航与面板恢复 | `mek/navigation.js`、`mek/header.jsx` | 主面板记忆、会话/标签恢复 |
| 团队运营扩展 | `mek-policy.js`、`mek-knowledge.js`、`mek-workflows.js`、`mek-team.js` | 执行策略、知识库、工作流激活校验、活动摘要 |

### 1.2 实现与稳定性保障（不是独立可见功能，但不能丢）

| 保障 | 主要文件 | 说明 |
|---|---|---|
| 原生 feed：多标签/多窗口共用一条流，BroadcastChannel + 心跳选举 | `mek/feed.js` | 上游若重构 transport，只吸收其修复，不替换 |
| Bot 删除生命周期 | `sidebar.js`、`overlays.js`、`host/` 相关 | hook 顺序、面板退役、焦点转移、跨窗口删除清理 |
| 包身份 | `ds-bot/package.json` | `dsh-mek-bot` / `main: mek.js` / `exports["./upstream"]` / `files` 含 `mek.js`·`NOTICE`·`README.zh.md` |

### 1.3 集成文档已写明的下游边界（比文件名更能指导合并）

- 隐藏计划任务控件
- 无登出、无界面模式切换
- Agent 仍可从 Bot 列表进入
- 不修改 DSH 源码

详见 [makeepoch-integration.md](makeepoch-integration.md)。

## 2. 上游能力：逐项判断是否适用于插件

**不要一律写"必须吸收"。** 下表是 v0.2.4 的内容，适用性需逐项验证。

| 上游能力 | 对本插件的适用性 |
|---|---|
| 私有 Bot（`privacy.js`） | **需收窄描述**：它对插件管理的工具与部分路径提供访问限制、外发需用户审批，**不是系统级安全隔离**；shell 仍可能访问当前账户有权限读取的文件 |
| Office 文档（`src/office/`、`office.js`、`@xmldom/xmldom`） | 上游方案区分桌面应用与 DSH Web；Web 没有随包 Python 与渲染器，部分功能依赖额外环境。**本 fork 是否具备完整能力待验证** |
| Deep View 共享包（`deep-view`） | 技术实现；用户价值是视图能力与 Deep View 插件共存，**共存尚未实测** |
| 组内全部停止、技能建议、AGENTS.md 更新建议 | 与插件形态无冲突，按版本吸收 |
| 侧栏拖拽/折叠/窄窗优先折叠、窄栏未读与待审批点、截断名称 tooltip | 与我们的侧栏改造有重叠，见 §3 |
| `app/`、`mobile/` 演进 | 属上游源码维护项，**不算插件业务功能**；保留谱系，不做裁剪 |

## 3. 同名不同实现：本次合并的候选解法（待复核）

> 以下是 v0.2.4 合并时的判定与理由，**不是无条件规则**。下次升级请重新验证。

| 对象 | 上游 | 我们 | 本次判定 | 依据强度 |
|---|---|---|---|---|
| `chatRoom` | 抽到 `src/client/frame-watch.js` | 旧版内联在 `browser-pane.js` | 取上游 | 代码确认已搬家；但"功能无损"仍需运行时验证（列选择、布局偏移、卸载清理） |
| `show_view` 工具 | `showViewTool` 按 Bot 会话注册，`WeakSet` 防重复 | `registerTeamTool` 全局注册 | 取上游 scoped 结构 | 代码确认；"不泄露到普通会话"仍是意图，需覆盖普通会话/Bot/group/重复初始化/与别的插件同名工具共存。group 拒绝逻辑含 `mekCurrentWorks` 例外，不能概括为"始终拒绝" |
| 其余工具注册 | — | 多处 `registerTeamTool`（`tools.js` 内 15 处，其中一处有条件；其他 host 文件也有） | **不写固定总数**，按各自作用域保留并测试 | 静态计数 |
| `Overlays` props | `useFrame` / `useSidebarPref` | `TeamOverview` | 并集 | "并集"不等于行为等价；Mek 调用方不传 frame hooks，走 fallback，布局效果待验证 |
| `sidebar.js` | `nameIfCut`、窄栏 `bt-dot`、`wideContent`、抽屉、快捷键 | 导航态 `aria-expanded`、`pill-go`、22px、`mek-team-nav` | 并集 | 需覆盖宽窄屏与抽屉行为 |
| `dev/harness/package.json` | pin `0.2.1-rc.4` | `react`/`react-dom 18.3.1` + pin `0.2.2-alpha.2` | **保留已验证的 fork 约束**（本次取 ours） | 取上游会让 client 测试跑不起来，已验证 |
| `README*` | "已测试版本"声明 | fork 品牌与截图 | 正文保留 fork；上游声明必须标明归属 | 上游测试声明 ≠ 本 fork 实测结论 |
| `client.js` | 构建产物 | 构建产物 | 永远重建，不手解冲突 | 构建脚本覆盖 |

## 4. 每次升级的标准动作

1. 备份：`git tag backup/pre-<ver>-merge HEAD` + 同名 branch
2. 工作区先清干净：未提交改动先 WIP 提交。Git 在会覆盖时会拒绝合并，但未冲突的改动可能被一并带入，事后难以分辨
3. `git fetch upstream --tags`，确认新 tag 的 commit
4. 在新分支 `git merge <tag>`；`--no-commit` 可用于合并前审查，`-X theirs` 不要用
5. 按 §3 的思路逐项判定；拿不准的保留冲突标记并上报，不猜
6. `npm install` → `npm run build`（覆盖 `client.js`）→ `npm test`
7. 失败项分类：**上游原有 / 我们引入 / 合并导致**。判定 fork 回归要在**合并前的 fork 基线**上跑对应测试，并记录实际匹配数；纯上游 tag 不含 fork 测试，"未匹配"不等于"通过"
8. 更新 `.makeepoch/upstream.json` 的 `commit`
9. 不 push、不动 `~/.dsh/profiles/web/node_modules/dsh-mek-bot`（正在跑的安装副本）

## 5. 禁区

- 不改 DSH 源码
- 不同时启用上游 `ds-bot` 插件（两者实现同一套 Bot API）
- 不手改 `client.js`、不把上游 `src/client/index.js` 的全局接管接进来
- 不用上游 README 的"已测试版本"代表我们的验证结论

## 6. 本次 v0.2.4 合并记录（2026-10-31）

- 基线：`v0.2.3`（`4a7b550`）→ `v0.2.4`
- 冲突 11 个：`README.md`、`README.zh.md`、`ds-bot/README.md`、`ds-bot/client.js`、`ds-bot/package.json`、`ds-bot/package-lock.json`、`dev/harness/package.json`、`src/client/browser-pane.js`、`src/client/overlays.js`、`src/client/sidebar.js`、`src/host/tools.js`
- 判定：client.js / package-lock.json 取上游后重建；README 与 harness 取 ours；browser-pane 取上游（chatRoom 搬家）；overlays 与 sidebar 并集；show_view 取上游 scoped 结构
- 实测：
  - 合并后 `npm run build` 通过，`npm test` **1314 通过 / 1 失败**
  - 纯净 `v0.2.4` 基线（需先 `npm run harness`）：**1223 通过 / 0 失败**
  - 剩余 1 条 `mek-delete-lifecycle` 的 `Missing [data-bot-id="main"]` 是测试环境问题：`dom.js:91` 的 `innerWidth` 取 `scene.clientWidth`，JSDOM 无布局为 0，`frameLayout` 因此判定为 rail 而不渲染主 Bot 行。产品行为是上游的窄屏折叠，不是回归
- 候选改进（**未验证、本次未改**）：`scene.clientWidth === 0` 时 `??` 会折成 rail，真机首帧是否闪一下 rail 需浏览器实测；`frame-watch` 的 ResizeObserver 会在场景可见后重新测量，暂不改产品代码
