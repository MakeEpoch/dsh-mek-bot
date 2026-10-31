# 下游 fork 与上游 DS-Bot 的差异与合并参考

本文回答一个问题：**下次合并上游时，哪些是我们的、不能丢；哪些是上游的、值得吸收；哪些名字相同但实现不同、最容易合错。**

- 上游：`Fei2411/DS-Bot`（`upstream` 远端），基线记录在 [.makeepoch/upstream.json](../.makeepoch/upstream.json)
- 下游：`MakeEpoch/dsh-mek-bot`（`origin` 远端），只保留 **DSH 插件** 这一种形态
- 集成边界的技术细节见 [makeepoch-integration.md](makeepoch-integration.md)
- 界面验证的环境、分层、用例和记录格式见 [UI 测试方案](dev/mek-ui-testing.md)
- **状态说明**：本文基于 2026-10-31 合并 v0.2.4 的静态复核与一次实测（见 §6）。§3 是**本次合并的候选解法**，不是下一次升级的无条件规则；每次都要按当时的代码和测试重新判定。

## 0. 定位差异（一切差异的根源）

| | 上游 DS-Bot | 我们 dsh-mek-bot |
|---|---|---|
| 产品形态 | 独立应用（`app/` 桌面 + `mobile/` 移动）+ 插件 | 只做 DSH 插件 |
| 界面接入 | `src/client/index.js` 接管全局 shell | `src/client/mek/index.jsx` 走公开 slots API，原生组件渲染 |
| 安装包 | `ds-bot` | `dsh-mek-bot`，入口 `mek.js` |
| DSH 版本跟踪 | `0.2.1-rc.4` | `0.2.2-alpha.2`（`dev/harness/package.json` pin） |

本 fork 的交付目标是：**把长期 Bot 团队、任务协作和可核查交付接入用户现有的 DSH 工作区。** 上游支持独立应用及插件多种形态；本 fork 按自身的插件边界选择和适配上游能力，不把独立应用的全局界面接管一并带入。

### 项目特点

1. **原生共存**：DSH 左侧只增加一个 Bot 入口，Bot/群聊/Agent 在插件顶部导航中选择；普通会话、宿主侧栏、设置和自动化由 DSH 管理。`app/ui/` 仍被复用，不意味着发布独立桌面端。
2. **交流入口稳定**：任务留在最初联系的 Bot，委派、决策、返工、结果和验收围绕原负责人展开；直接联系其他 Bot 的对话保持独立。
3. **结果有状态和证据**：返回结果不自动等于验收通过；保留问题、产物、检查、失败和送达不确定状态，重启后继续核对。
4. **团队运营可配置**：提供执行策略、摘要共享、项目事实、复用流程及可选浏览器接管；能力依赖宿主及配置，具体限制见集成文档，不宣称系统级隔离或真实模型必然正确。
5. **升级保留谱系**：保留上游目录、许可证和 Git 历史，以 `mek.js`、`src/client/mek/`、host 适配及少量共享组件接口承载差异。合并上游时核查调用链和用户流程，不仅检查冲突文件是否消失。

## 1. 下游差异与需保留的体验

分两类看，别混在一起判断。

### 1.1 用户可见的体验（合并时优先保住）

| 体验 | 主要文件 | 说明 |
|---|---|---|
| 单一边栏入口 + 顶部导航 + 原生面板 | `src/client/mek/index.jsx`、`mek/view.jsx`、`mek/header.jsx` | 无 iframe、无第二个 DSH、无外层 Agent 快捷方式；不接管宿主侧栏，窄屏详情限定在插件区域内 |
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

- 隐藏 Bot 自带的计划任务控件，复用 DSH 自动化
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
| `Overlays` props | `useFrame` / `useSidebarPref` | `TeamOverview`、`embedded`、原生面板尺寸 | 显式适配嵌入模式 | 原生面板由 ResizeObserver 测宽，不扣除不存在的左栏；窄屏详情覆盖聊天区，宽度限制在插件区域内 |
| `sidebar.js` | `nameIfCut`、窄栏 `bt-dot`、`wideContent`、抽屉、快捷键 | 导航态 `aria-expanded`、`pill-go`、22px、`mek-team-nav` | 保留通用行功能，隔开独立侧栏副作用 | 顶部导航不写左边距、不折叠 DSH 侧栏、不拦截侧栏快捷键、不渲染账户页脚；主 Bot 保持在 header 内 |
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
  - 上述为初次合并记录。复核确认存在原生 UI 回归：顶部导航混入独立侧栏的布局与账户页脚，窄屏详情被错误折叠；不能将主 Bot 缺失一概归因于 JSDOM。
- 原生 UI 修正后的验证：
  - 全量测试 **1370 通过 / 2 跳过 / 0 失败**；本地 mock 服务测试需要允许回环端口监听。构建一致性检查通过，lint 通过但存在警告。
  - 生命周期测试恢复“主 Bot 位于 header 内”的断言，覆盖 900、700、390、0、1200px 的容器尺寸变化与详情显示。
  - 真实 Chrome 使用最新 client.js 和本地 mock 页面验证：900px 并排详情；700/390px 覆盖详情；宿主侧栏开合使插件区域在 700/884px 间变化时自动调整布局；聊天区左边距为 0，账户页脚不存在，无页面异常。
  - Chrome 验证使用隔离的宿主布局夹具，未替换用户正在运行的 DSH 安装副本，不代表该安装已更新。
  - 后续安装前验证：冻结的 `dsh-mek-bot@0.2.4` tgz 安装到独立 profile，在实际 DSH `0.2.2-alpha.2` 中通过 Bot 创建、模型选择、委派和群聊回复；协作闭环通过用户决策、恢复、返工、证据检查和验收；团队策略、摘要通知、知识冲突与历史、工作流草稿和预算冒烟通过。
  - 同一隔离 DSH 的真实 Chrome 检查确认顶部 Bot 导航、详情面板、宿主侧栏开合、聊天区左边距为 0，未出现 Bot 独立侧栏或账户页脚。此次发现并修正两个冒烟脚本混用 Bot 身份 ID 与运行会话 ID 的断言；运行时任务归属保持原语义。此记录仍不等于正式安装副本的浏览器验收。

## 7. 文档必须随功能维护

新增功能、改变入口或交互、调整权限与限制、持久化格式变化、上游升级引入或删除能力，都必须在同一改动中更新文档。修 bug 如果恢复已记录的行为，可以只补回归用例和验证记录；如果现有说明已经过期，仍需同步纠正。

| 改动 | 必须核对并更新的文档 | 至少说明 |
|---|---|---|
| 新功能或现有能力变化 | 本文功能清单；涉及用法时更新根目录及 `ds-bot/` 包内的中英文 README | 谁使用、入口、主要流程、结果、限制、代码位置与验证状态；包内链接需适用于独立安装 |
| 接入、工具作用域、存储、权限或依赖变化 | `makeepoch-integration.md`；大功能增加/更新 `docs/plans/` 设计 | 宿主与插件职责、数据与兼容策略、失败/恢复行为、适用环境 |
| UI、导航、弹层、响应式或生命周期变化 | `dev/mek-ui-testing.md` 测试矩阵；涉及视觉规范时核对 `design/ui-standard.md` | 操作步骤、可观察验收标准、宽窄屏/状态覆盖、证据要求 |
| 合并上游或升级 DSH | 本文适配判定与验证记录；`.makeepoch/upstream.json`；有影响的使用/集成/测试文档 | 上游 tag/commit、能力采用/适配/不采用/待验证的理由、保留的下游行为、检查结果 |
| 安装、构建或验证方式变化 | README、贡献指南及相关开发文档 | 当前可执行命令、版本来源、环境前置条件、停止及清理方式 |

每项能力的描述应能回答：当前入口在哪里、主要源码在哪里、继承上游还是下游适配、哪些环境已验证、哪些仍未知。不要把同类功能都称为本 fork 独有；未做上游对比时写明未比较。不要将上游版本的测试结论、代码存在、组件测试或 mock 场景推导为已安装副本可用或真实业务验收。

维护顺序：先核对本节与集成边界 → 改代码与相关用例 → 同步功能清单、用户说明和测试方案 → 按测试方案记录实际执行范围 → 在 PR 模板中列出文档路径及证据。删除或替换旧入口说明，避免只在文末追加一段导致同一文档自相矛盾。版本和能力不再适用时更新原表项；历史验证保留日期及其范围。

本规则同时写入 [AGENTS.md](../AGENTS.md)、[贡献指南](../CONTRIBUTING.zh.md)和 [PR 模板](../.github/pull_request_template.md)，供后续人工与 agent 工作遵循；当前没有自动判断“文档是否完整”的 CI 门禁，仍需审查者核对。纯文档改动执行链接、命令依据、双语一致性和状态复核即可。
