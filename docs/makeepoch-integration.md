# MakeEpoch integration boundary

This downstream reuses Fei2411/DS-Bot. The exact baseline is pinned in [upstream.json](../.makeepoch/upstream.json). No DSH source code is modified.

## Native UI

`ds-bot/src/client/mek/index.jsx` registers one `sidebar.panellist` entry and one `main` pane, using the public slots API. There is no outer Agent shortcut, iframe wrapper, second DSH application or second plugin load.

`mek/view.jsx` composes the existing `TeamSidebar`, `HeaderPill`, `Chat`, `Overlays` and settings components, using `app/ui/src/team.js`'s existing state/feed controller. Bot/group/new/settings forms stay at their upstream paths. The original global-shell takeover entry `src/client/index.js` is not invoked.

The native build binds upstream view modules to local DOM/window facades and a scene-local portal helper. CSS uses `@scope (.mek-bot-scene)`; root selectors are mapped without changing class names. Geometry and pointer coordinates are relative to the pane. No browser global, prototype, DSH service or another plugin is replaced. Child effect cleanup remains safe after the containing pane has detached, and owned listeners are removed. Dynamic details-panel styles retain their scope and CSSOM style rule.

The Bot sidebar supports collapse/expand. A roster watcher clears deleted subjects from the selected conversation and overlays, including deletions made in another window. Retiring panels transfer focus before becoming inert and aria-hidden. Composer hooks remain unconditional when a target disappears. Its footer only exposes Usage, Connectors and Bot settings. Capability guards omit scheduled-task controls in settings, details and the composer. Logout and surface-mode switching are absent. The optional DSH Agent stays in the Bot list, with upstream create/open/archive/rename behavior, and opens plain sessions through public DSH workspace navigation.

`mek/group-chat.jsx` reuses upstream group replies and composer components. `src/host/mek-room-chat.js` pages the durable group Session through `sessionController.page`, preserving earlier rounds and speaker identities. Active rounds use upstream room progress. Requests share the existing authenticated Bot channel, not a new server.

Small UI seams export existing Composer/GroupReplies/GroupMessage components and the standalone controller's refresh/state sources. The details pane tolerates detached cleanup and scoped CSS rules. Upstream defaults remain unchanged when a capability is present.

## Host and installation

`ds-bot/mek.js` wraps upstream `index.js`. Team state defaults to `DSH_HOME/mek-bot`. `team-registration.js` uses DSH 0.2.2's tool admission condition for team sessions; ordinary DSH sessions do not receive team tools. Optional browser tools use the same seam. `autoGreet: false` avoids automatic model greetings, and downstream automatic update checking is disabled.

The bundle adds only this plugin. It does not change DSH search, presets, native sidebar/composer settings or other plugins. The original `ds-bot` bundle must not be enabled at the same time, because both implement the same Bot API.

Use `npm pack --ignore-scripts` and a content-hashed archive for production. Keep `autoInstallPeers: false`. Host API modules are optional peers, supplied by DSH's loader; never install a second Cordis/tools/scope/LLM core to satisfy raw Node imports. Development dependencies stay in `dev/harness`.

Uninstalling leaves team state and DSH history in place. Native visual scoping is not an access-control sandbox: normal DSH authentication and model/tool permissions still apply.

## Task coordination

`src/host/mek-coordination.js` is installed only by the downstream entry. It reuses upstream handoffs and delivery, adding a persistent original task owner, suspended decisions, structured results, revisions, acceptance and cancellation. Small optional hooks in tools/turns/resume/approvals/secrets/channel preserve upstream behavior without the adapter. `mek/tasks.jsx` adds collapsible native progress and reuses the real approval and credential cards in the owner's chat.

Question resumes use a fresh delivery id with the same handoff id; revisions use a new handoff linked to the original task. Replies are retained before the handoff closes. Uncertain delivery is reconciled before replay; unreadable history remains unknown. Independent direct user turns do not inherit pending delegated work. The stable ownership prompt guides decisions; runtime checks enforce routing, ownership and completion prerequisites. Existing pre-adapter handoffs are not silently reassigned. See the [downstream task design](plans/2026-10-30-mek-task-ownership.md).

## Merge and verify upstream

Keep `upstream` pointing to `https://github.com/Fei2411/DS-Bot.git` and `origin` to MakeEpoch. Fetch upstream, create an update branch from downstream main, merge the desired commit and resolve metadata, the small API/export seams and native build bindings. Update the pinned commit. Preserve upstream ancestry and source locations; do not replace them with a copied client implementation.

Run `npm ci`, `npm run harness`, build, unit tests, generated-client check and lint from `ds-bot/`. For host changes, run model selection, delegation and group replies through `dev/mek-smoke.mjs` against a separate `.dsh-test-*` profile and bundled mock model. Verify native UI: create Bot, Agent entry, collapse/expand, details open/close, group history and replies, settings, and repeated transitions to DSH panels. Check for no Bot wrapper iframe, no parent-body style/data leakage and no component exceptions. Stop the test services afterward.

Original README files remain as `README.upstream*.md`. Inherited desktop/release CI is manual. `.github/workflows/makeepoch.yml` checks this plugin against DSH 0.2.2-alpha.2. Screenshots contain only local mock-model conversations. Apache-2.0 and attribution are preserved.
