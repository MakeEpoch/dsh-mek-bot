# MakeEpoch integration boundary

This downstream reuses Fei2411/DS-Bot rather than rebuilding its screens or Bot runtime. The exact baseline is recorded in [upstream.json](../.makeepoch/upstream.json).

## Entry points

- `ds-bot/mek.js` wraps the unchanged upstream `index.js`. Team data defaults to `DSH_HOME/mek-bot`, leaving the upstream `DSH_HOME/bot` directory alone.
- `ds-bot/src/client/mek/index.jsx` adds one `sidebar.panellist` item and one `main` panel. The panel loads the same authenticated DSH page in a same-origin iframe with `?mek-bot=1`.
- Inside that child document the adapter calls upstream `src/client/index.js` directly with `lockBotMode: true`. Its sidebar, forms, chats, questions, settings, CSS, shortcuts and native DSH integrations are the existing plugin implementation. This optional flag fixes the child in Bot mode and omits the Agent-mode switch from both the account menu and settings; the original behavior remains available when the flag is absent. The parent document never calls that implementation.
- The iframe flag is a rendering selector, not an authentication mechanism. DSH continues to enforce its normal authentication and API access checks. There is no second service, duplicated host runtime or copied DSH installation.

## Small host changes

`team-registration.js` adds DSH 0.2.2's documented tool activation condition when `isolateTools` is enabled. The upstream host registration sites call this helper; Bot and group sessions receive their tools, ordinary DSH sessions do not. Optional browser tools use the same seam. With the option absent, upstream registration behavior is preserved.

`roster.js` accepts `autoGreet: false`, which persists new Bots without starting a model call. The MakeEpoch entry enables this option. The user starts a conversation explicitly.

The bundle installs only `dsh-mek-bot`. It does not change DSH's search provider, presets, theme settings, native sidebar or composer. The upstream web-search helper remains available in source, but this bundle does not activate it. The adapter disables its automatic update check; use reviewed downstream releases.

Do not enable the original `ds-bot` bundle together with this bundle: they implement the same Bot services and API routes.

## Updating upstream

Keep `upstream` pointing to `https://github.com/Fei2411/DS-Bot.git` and `origin` pointing to MakeEpoch. Fetch upstream, create an update branch from downstream `main`, merge the desired upstream commit, resolve the package/build metadata and the small registration changes, then update the pinned commit. Do not squash away the upstream ancestry or copy the whole upstream client into the adapter.

The original UI entry, its components, and `app/ui` are kept in their original locations. UI changes are limited to the optional mode lock and the account menu respecting the switch capability. Original README files are retained as `README.upstream*.md`. Inherited desktop/release CI is manual; `.github/workflows/makeepoch.yml` checks this plugin on DSH 0.2.2-alpha.2.

Run `npm ci`, `npm run harness`, `npm run build`, `npm test`, the generated-client check and lint from `ds-bot/`. After host changes, also exercise model selection, Bot delegation and group replies with `dev/mek-smoke.mjs` against a separate `.dsh-test-*` profile and the bundled mock model. Never run that script against the user's service or data.

## Packaging and data

Use `npm pack --ignore-scripts`; install a content-hashed archive into a DSH profile with `autoInstallPeers: false`. Host `@deepseek-ai/*` modules are optional peers, supplied by DSH's official loader. Never install a second Cordis/tools/scope/LLM core into the production profile to satisfy raw Node imports. Development harness dependencies stay in `dev/harness`.

Uninstalling the package leaves team data and DSH session history in place. The iframe is a visual boundary, not a security sandbox; the normal DSH permissions still apply to Bot work.

Apache-2.0 and upstream attribution are preserved. Screenshot examples contain only local mock-model test conversations.
