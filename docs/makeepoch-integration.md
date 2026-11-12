# MakeEpoch integration boundary

This downstream reuses Fei2411/DS-Bot. The exact baseline is pinned in [upstream.json](../.makeepoch/upstream.json). No DSH source code is modified.

## Native UI

`ds-bot/src/client/mek/index.jsx` registers one `sidebar.panellist` entry and one `main` pane, using the public slots API. There is no outer Agent shortcut, iframe wrapper, second DSH application or second plugin load.

`mek/view.jsx` composes the existing `TeamSidebar`, `HeaderPill`, `Chat`, `Overlays` and settings components, using `app/ui/src/team.js`'s existing state/feed controller. Bot/group/new/settings forms stay at their upstream paths. The original global-shell takeover entry `src/client/index.js` is not invoked.

The native build binds upstream view modules to local DOM/window facades and a scene-local portal helper. CSS uses `@scope (.mek-bot-scene)`; root selectors are mapped without changing class names. Geometry and pointer coordinates are relative to the pane. No browser global, prototype, DSH service or another plugin is replaced. Child effect cleanup remains safe after the containing pane has detached, and owned listeners are removed. Dynamic details-panel styles retain their scope and CSSOM style rule.

Scene-owned portal targets are preserved, including the transient activity outlet at the end of the single-chat flow. Targets outside the scene are redirected to the scene root. The row reuses running/tool/streaming state and never persists a chat item; tail following respects users reading earlier messages. Pending interactive `show_view` cards render from roster state even when no tool-history row is available. `mek/native-question.jsx` consumes the optional public `uiSession.sessionStatus` interaction carrier for the shown Session (question and plan-review), preserving its answer/dismiss callbacks, question IDs and option labels. Closed carriers disappear; review carriers are read-only. Submission locks prevent duplicates and rejected submissions retain input for retry. This does not bind Bot to DSH main-view retention or add the native right sidebar; other unpublished host-panel requests remain outside the adapter.

Native notices and the Bot controller share a feed through `mek/feed.js`, selected only by the native build. Visible documents coordinate through an origin/base-path-scoped BroadcastChannel so multiple Bot tabs or windows use one live stream. A heartbeat elects a replacement when its owning document leaves; browsers without BroadcastChannel fall back to one stream per visible document. Hidden tabs release that HTTP stream and retain the existing periodic state/notification reads. Visibility restores the stream and its `hello` catch-up. This prevents multiple Bot tabs from exhausting HTTP/1.1 connection slots and blocking DSH navigation, assets and API requests. Upstream's standalone transport remains unchanged.

The Bot list stays in the top header. Navigation mode never reserves a left column, collapses DSH's sidebar, intercepts its sidebar shortcut or adds an account footer. The header menu exposes Usage, Connectors and Bot settings. A ResizeObserver measures the native pane, including changes caused by DSH's own panels. Bot details use that available width and overlay the conversation when narrow, with their width contained inside the pane. A roster watcher clears deleted subjects from the selected conversation and overlays, including deletions made in another window. Retiring panels transfer focus before becoming inert and aria-hidden. Composer hooks remain unconditional when a target disappears. Capability guards omit scheduled-task controls in settings, details and the composer. Logout and surface-mode switching are absent. The optional DSH Agent stays in the Bot list, with upstream create/open/archive/rename behavior, and opens plain sessions through public DSH workspace navigation.

`mek/group-chat.jsx` reuses upstream group replies and composer components. `src/host/mek-room-chat.js` pages the durable group Session through `sessionController.page`, preserving earlier rounds and speaker identities. Active rounds use upstream room progress. The native group transcript appends one transient activity row per member in `work.rooms[roomId]`, including members still working after their round yields. It shares member-state labels, avatars and elapsed clocks, scopes approvals to this group, and excludes private-chat/other-group activity. Native round replies disable their separate typing indicator to avoid duplicates; standalone defaults remain unchanged. These rows never persist history or send messages, disappear on completion/stop, and follow the tail only while the reader stays there. Requests share the existing authenticated Bot channel, not a new server.

Small UI seams export existing Composer/GroupReplies/GroupMessage components and the standalone controller's refresh/state sources. The details pane tolerates detached cleanup and scoped CSS rules. Upstream defaults remain unchanged when a capability is present.

`mek/permissions.jsx` retains only the displayed Bot part through public `ctx.sessions.retain` with its own reference source and reads the `permissions` projection. It releases its reference on teardown and ignores late acquisition results. The current-session permission entry explicitly opens that exact Session through public `uiWorkspace` navigation; native DSH owns the selector, catalog, experimental badge and risk confirmation. It neither executes `/permission auto` on the user’s behalf nor changes the Bot preset. Existing cross-session Bot permissions remain in a separately labelled disclosure with their original propagation behavior. DSH’s `conversation.input.permission` child slot has one declaration owner; redeclaring it breaks composition, and this version exposes no reusable public permission component. The abandoned embedding prototype was removed. This explicit navigation is independent of binding the Bot pane to DSH’s main conversation or adding its right sidebar.

## Host and installation

`ds-bot/mek.js` wraps upstream `index.js`. Team state defaults to `DSH_HOME/mek-bot`. `team-registration.js` uses DSH 0.2.2's tool admission condition for team sessions; ordinary DSH sessions do not receive team tools. Optional browser tools use the same seam. `autoGreet: false` avoids automatic model greetings, and downstream automatic update checking is disabled.

During an in-place plugin reload, the runtime rebuilds activity from the live DSH agent registry and restores surviving turn records from `inflight.json`. Owned agents regain their core and downstream tools after extension setup. The surviving turn keeps its original delegation route, and a later request gets its own reply.

Unloading the policy marks in-flight model usage incomplete and in-flight resource leases stale and uncertain. Completion callbacks from that policy instance let the DSH result through after its state lock has been released.

Group relays carry image attachments from the lines a member can read, including formal group dispatches. Each synthesized relay gets unique arguments for DSH’s repeat-tool detector. On two consecutive empty output cut-offs, the idle part checks whether its history fits a fresh Session before switching without a generated note.

The bundle adds only this plugin. It does not change DSH search, presets, native sidebar/composer settings or other plugins. The original `ds-bot` bundle must not be enabled at the same time, because both implement the same Bot API.

Use `npm pack --ignore-scripts` and a content-hashed archive for production. Keep `autoInstallPeers: false`. Host API modules are optional peers, supplied by DSH's loader; never install a second Cordis/tools/scope/LLM core to satisfy raw Node imports. Development dependencies stay in `dev/harness`.

Uninstalling leaves team state and DSH history in place. Native visual scoping is not an access-control sandbox: normal DSH authentication and model/tool permissions still apply.

## Task coordination

Giving up an open handoff detaches that wait from its parent. Formal task records keep the abandoned branch and its late output. The same state write retains the notification for the original waiting conversation and cancels pending outbox entries for the detached branch. Existing workers retain their task association while they return late output.

`src/host/mek-coordination.js` is installed only by the downstream entry. It reuses upstream handoffs and delivery, adding a persistent original task owner, suspended decisions, structured results, revisions, acceptance and cancellation. Small optional hooks in tools/turns/resume/approvals/secrets/channel preserve upstream behavior without the adapter. `mek/tasks.jsx` adds collapsible native progress and reuses the real approval and credential cards in the owner's chat.

Question resumes use a fresh delivery id with the same handoff id; revisions use a new handoff linked to the original task. Replies are retained before the handoff closes. Uncertain delivery is reconciled before replay; unreadable history remains unknown. Independent direct user turns do not inherit pending delegated work. Returned results project as report-required or awaiting-review rather than active execution. New result deliveries include explicit review/repair instructions; legacy returned work gets one durable owner reminder without replaying worker actions. The native task list folds per Bot in tab-local storage while approvals and secure credential cards remain visible. The stable ownership prompt guides decisions; runtime checks enforce routing, ownership and completion prerequisites. Existing pre-adapter handoffs are not silently reassigned. See the [downstream task design](plans/2026-10-30-mek-task-ownership.md).

## Team operations extensions

The downstream entry installs `mek-policy.js`, `mek-knowledge.js`, `mek-workflows.js` and `mek-team.js` after coordination. Their versioned state lives in the existing atomic team store; unknown future formats are refused without replacement. Task events carry metadata only; authorized summaries are separately recorded and delivered through durable notices without changing task ownership. User sharing controls are channel-only, not model tools.

Execution restrictions use public tool guards, tool dispatch and LLM stream hooks. They add restrictions without bypassing DSH approvals. Cooperative resource claims cover known mutators and explicit bindings, not arbitrary background subprocesses. Token limits gate subsequent calls; they cannot stop all in-flight provider output at an exact monetary amount. Project facts require an explicit scope and source. Workflow activation requires an accepted validation task tied to an immutable version digest. Scheduling remains a DSH responsibility. The schedule adapter keeps stable team management ownership separately from DSH delivery targets: Main Bots can manage non-private team Bot/group schedules; ordinary Bots remain in their logical chat. New independent targets are captured from successful tool creation, not inferred from directories or the mixed involved-session notification set. Legacy known team targets and durable to-do bindings are adopted; unverified independent tasks remain outside the managed set. Edits carry the read revision to DSH, and to-do clock changes pass through the rule adapter and original tool pipeline rather than editing only the binding. See the [schedule ownership contract](plans/2026-11-03-mek-conversation-tasks.md#20-团队定时管理归属2026-11-05).

Native views remain under `src/client/mek/`; the existing controller exposes optional `mekTeam` state. Artifact previews use public workspace-file APIs and the producing session. The optional browser adapter exposes observation/control of existing sessions through the authenticated Bot channel and serializes human actions with Bot actions. No browser is launched by observation, and screenshot masking does not grant access to credentials. See [team operations design](plans/2026-10-30-mek-team-operations.md).

DSH file queries (`read`, `grep`, `glob` and the editor's `view`) do not acquire an automatic workspace lease. Known writes and shell commands use the Session's workspace lease. Explicit resource bindings remain applicable. Waiting for a live conflict has one 30-second budget across all wakeups and exposes the holder and directory through live work state. Expiry returns the waiting call before dispatch and leaves the active lease with its holder.

The MEK adapter admits the DSH-registered `subagent_codex` in a Main Bot's current private Session. DSH owns the tool, its permissions, and delivery of the completion notice to the exact parent. MEK reads the parent from the scoped lifecycle event, exposes live activity and sends a parent-scoped stop for the selected child. Conversation rollover waits while Codex is running so DSH can deliver the result to the originating Session. A plugin reload can recover activity for the same live DSH Agent. A host restart does not resume a native Codex run. File operations inside the external Codex process use the provider's permission mode and run outside the MEK tool-call lease hooks.

## Merge and verify upstream

Keep `upstream` pointing to `https://github.com/Fei2411/DS-Bot.git` and `origin` to MakeEpoch. Fetch upstream, create an update branch from downstream main, merge the desired commit and resolve metadata, the small API/export seams and native build bindings. Update the pinned commit. Preserve upstream ancestry and source locations; do not replace them with a copied client implementation.

Run `npm ci`, `npm run harness`, build, unit tests, generated-client check and lint from `ds-bot/`. For host changes, run model selection, delegation and group replies through `dev/mek-smoke.mjs` against a separate `.dsh-test-*` profile and bundled mock model. Verify native UI: create Bot, Agent entry, collapse/expand, details open/close, group history and replies, settings, and repeated transitions to DSH panels. Check for no Bot wrapper iframe, no parent-body style/data leakage and no component exceptions. Stop the test services afterward.

Original README files remain as `README.upstream*.md`. Inherited desktop/release CI is manual. `.github/workflows/makeepoch.yml` checks this plugin against DSH 0.2.2-alpha.2. Screenshots contain only local mock-model conversations. Apache-2.0 and attribution are preserved.

## Documentation and UI acceptance

Every feature, changed user flow, capability restriction and upstream adaptation updates its documentation in the same change. Maintain current features and differences in the single Chinese [README](../README.md), synchronize its packaged copy, and keep old language entries as compatibility links. Maintain upstream changes and adoption in the [per-version merge records and documentation matrix](fork-vs-upstream.md), plus affected design/integration contracts. Visible behavior changes also update the [UI test plan](dev/mek-ui-testing.md).

The UI plan distinguishes component checks, real-browser fixtures and isolated DSH/package acceptance. A fixture result does not establish slots, authentication, persistence or coexistence inside DSH; an upstream merge and release candidate require the applicable DSH integration checks. Record the actual source/bundle identity, executed cases, screenshots, failures and unknowns. Current CI does not execute the complete browser matrix. Documentation-only changes use link, source and root/package copy review without rerunning model/UI suites.


## Review repairs for upstream 0.2.6 (2026-11-03)

Native group history rows carry source Session, stable per-event/block identity and part order. The pane merges and sorts by that identity; on current-part rotation it reloads the newest page and restores the older-part cursor. Images use their producing Session. Native textareas reuse the upstream `mentionRows` candidates with local keyboard/IME-safe selection; upstream DSH inputs continue using their host trigger source.

Group selection shares the upstream picker, preserving explicit targets, authorized @all, group mode, and poster exclusion. Ordinary member announcements bypass coordinated task creation and retain only their group post. A substantive tool-free reply to a caller participating in the round releases its fan-in barrier; external posts still honor their original report-back semantics. This does not invent a structured task for a plain relay turn.

Resource auto-claims now last for a dispatch and any DSH background jobs it starts. Live conflicts wait without partial claims; cancellation, role restrictions and task limits are checked before execution. Explicit reservations and uncertain/legacy records remain conservative. See the updated execution-services design for release and restart boundaries.

DSH 0.2.2's presentation waterfall may contain only sections, contexts and variables. Do not require a `tools` field there: filter it only on hosts that provide it, and keep the public tool-execution guards for forbidden subagents/workflows independently active.

Group administrator coordination is a scoped system section rebuilt from the current group ownership, never a rewrite of every Bot's private instructions. Formal task titles, source goals and accepted outcome summaries are separate. Explicit continuation ids are checked against task ownership, conversation and inherited assignment. Individual formal work acceptance records a reviewed step, while to-do acceptance retains its revision checks and final task acceptance remains explicit.

Tracked group progress and results must pass through the group's durable Session as quiet posts; updating the bounded model log alone does not publish a native chat message. Already logged task posts carry their log sequence to avoid duplicate model-context entries, and the native pane recognizes them as visible member posts. Their text does not select speakers or dispatch another assignment.


## Conversation to-dos (2026-11-03)

The native adapter now layers persistent conversation plans over the existing root/work coordinator. Stable child ids retain their independent work attempts. Group-local plans use the current group administrator, while private task ownership remains unchanged; a handover retains running work and routes results to the new administrator. Accepted predecessor versions gate dispatch and supported tool execution. Paused or unknown work is never treated as success. The native pane exposes the same task records in group and assigned-member views.

DSH remains the clock owner. The optional schedule adapter uses public durable delivery history and change events to deduplicate occurrences, then creates a pending main plan or durably notifies its coordinator. The original clock wake is not a business dispatch and cannot call tools. Existing permissions, evidence checks, resource leases and cancellation continue to apply. See the [complete design and implementation limits](plans/2026-11-03-mek-conversation-tasks.md); do not infer full design acceptance from this first implementation.

### 群内首次派工与逐层回传

原生协调器启用时，群管理员从普通群回合调用 `message_bot` 即进入持久化执行任务，根任务保留用户目标及群 Session。成员只能在已有任务内继续派工；结果沿父任务逐层检查，最后回原群协调者。群内问题和返工也保持该入口。计划任务的管理员交接只调整协调者投递，不绕过嵌套检查者。用户 @ 继续选择回复成员，Bot 普通发言中的 @ 只显示提及。显式工具调用负责派工及回传，旧讨论不会在升级时自动重放；验收、未知结果、审批和凭据边界沿用既有契约。详见[任务所有权](plans/2026-10-30-mek-task-ownership.md#group-dispatch-return-chain-2026-11-03-hotfix)。

### 顶部收藏与临时会话（2026-11-03）

顶部只保留主 Bot、收藏项及当前临时会话，其他 Bot/群收在右侧图标列表。点击列表会话直接选择；星标独立切换收藏而不切换会话。收藏沿用持久化 `pinned` 标记，既有置顶保留；取消收藏后若仍选中则保留到切走。列表包含非主 Bot 和群聊（含此前隐藏的会话），收藏会恢复其可见性；不创建第二套 Bot 身份或会话。收起条目的消息/交互/任务未读汇总到入口，原任务标签和条目已读规则继续生效。弹层限制在 scene 内，支持 Escape、键盘聚焦和退场；原生 DSH 侧栏保持不变。任务卡片标题在侧面板内收缩换行，不依赖样式加载顺序。

## Optional WechatPad bridge (2026-11-05)

The native entry provides `mekBotBridge` v1 using public Cordis service registration. WechatPad owns connections, access control and versioned chat bindings; the Bot plugin owns identity validation, current parts, queue admission and visible-message filtering. Only Main Bots and existing groups are eligible. No upstream IM runner is installed. Native task coordination skips upstream goal runtime/skills and keeps one task ledger, while reusing the upstream state-free interaction ideas. See the [integration design](plans/2026-11-05-upstream-and-wechatpad.md).

## WeChat target settings (0.2.9)

The native details settings render an optional WechatPad-owned link editor. `wechatBotLinks` v1 provides credential-free target views and revisioned updates; Bot resolves stable Main Bot/group identity before forwarding. Optional service references are obtained and released in the injected scope. Transport availability, account login and policy states remain distinct from plugin absence/version mismatch. WechatPad owns discovery and persistence; the native client never reads account credentials or reply context tokens. WechatPad enriches existing group candidates with cached group names; the Bot client keeps the chat ID as the binding key and displays it alongside the name to distinguish duplicates.


## 微信附件与顶部状态展示（2026-11-05）

原生顶部会话标签保持单行，只显示头像、名称及贴头像的未读点，不绘制置顶图标或详情箭头。收藏持久化、列表星标及点击当前项切换详情的行为保留。微信入站附件的固定说明和路径清单仅在展示层转为折叠卡片，语音转写和其他文案直接显示，图片使用已有的真实缩略图；原始持久消息、模型输入及安全提示不改写。旧历史与新消息采用相同规则，解析失败保留原文。

`mekBotBridge` v1 新增可选 `supportsMedia` 和 `send(..., { beforePrompt })`。回调由 WechatPad 提供，Bot 在取消/能力准备及逻辑身份重新解析之后、实际 prompt 之前传入最终 sessionId/requestId；prompt 失败撤销登记。WechatPad 在真实 inbox claimed 事件中只为该微信请求打开附件 consumer，沿用已有的 `wechatpad_return_file`、`present` 快照和连接 `sendFile`。文件在成功轮次结束后发回原连接/聊天，不跟随可见文字向所有绑定广播；网页输入、混合来源、隐藏 Bot 回合、取消及解绑不能借用投递权限。群不继承成员隐藏轮次的产物权限；只有已发布的正式群发言中的显式附件标记进入发送。两插件均需包含本次能力扩展，版本号/既有绑定无需迁移。


## 定时管理全面复查（2026-11-06，已正式安装）

管理索引的读/认领使用同一个异步写入队列，未落盘的 owner 不为并发目标修改提供授权。规则编辑在首次意图保存失败或宿主明确未写入时恢复原规则与本次补齐的快照；未知结果仍保留意图核对。回执只来自已保存 clock id，复制 marker 的其他任务不被纳入；零/多绑定停止规则处理，创建响应未知但唯一绑定可被核实时恢复。时间字段无效或投递早于计划的回执，包括旧 pending 实例，不启动业务工作。

内部定时 guard 忽略宿主上下文快照。schedule 注入清理与引用身份绑定，旧 catalog/history 检查在服务替换/卸载或只读后退出。未新增宿主依赖、页面、后台调度器或正式数据迁移；后续获部署授权，隔离 rc.1 验证及卡片浏览器验证通过后，已通过标准 CLI 安装包含定时修复的 Bot 0.2.10 内容修订包。WechatPad 0.1.10 保持原包，未修改正式定时记录；部署回执见 UI 测试文档。

### 任务创建与收尾

普通 `post_to_group` 只写群历史，`report_back: true` 才进入协调器。继续已有任务传稳定 `task_id`；任务标题与执行消息分开存储，相同任务、派发方、目标和指令的重发复用已有派工。任务面板以执行状态区分执行中、待处理和已结束。

`task-review` 在写入前核对任务更新时间；补报告及处理阻塞同时核对原派工和结果时间。补报告使用已有结果与已核对证据，不发消息、不创建派工。验收沿用原有问题、证据、送达与权限校验；处理阻塞复用原任务下的返工链。已开始的待办使用同一报告记录，验收和返工保留自己的版本及依赖校验。存量任务由用户核对后处理，升级不批量改写。
