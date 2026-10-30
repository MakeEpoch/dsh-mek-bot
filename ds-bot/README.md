# dsh-mek-bot

[中文](README.zh.md) · [Upstream DS-Bot](https://github.com/Fei2411/DS-Bot)

MakeEpoch's DS-Bot integration for DeepSeek Harness. One **Bot** sidebar entry opens native React components from DS-Bot in the current DSH page. The Bot interface does not boot another DSH application or use an iframe.

![Native Bot interface in DSH; local mock-model example](https://raw.githubusercontent.com/MakeEpoch/dsh-mek-bot/main/docs/images/mek-bot.png)

## Use

The Bot sidebar keeps upstream's **New**, existing Bots, groups and optional **DSH Agent** row, with collapse and expand controls. Deleting the current Bot or group returns to an available conversation and closes obsolete overlays. Click the conversation title to open its details. The bottom menu contains Usage, Connectors and Bot settings. Logout, scheduled-task controls and the Agent-mode switch are omitted from this Bot surface; DSH's own interface remains available.

Bots have persistent identities, roles, models and memory, and can delegate work or discuss it in groups. The Agent row opens ordinary conversations using DSH's existing workspace navigation. Models, keys and permissions come from your DSH configuration. New Bots do not automatically send a greeting: pick a model and send a message yourself.

## Tasks stay with the Bot you contacted

Delegated work returns to its original contact. When Chief assigns a worker, the worker's questions go to Chief; Chief decides routine matters, asks you here only when necessary, and resumes the same task. Direct conversations you start with another Bot remain direct. Delegation cannot redirect you to the worker's chat. Group posts request a report back automatically.

Returned work awaits review. The owner can request a revision on the same task, inspect verification evidence, and accept the task only after outstanding work and decisions are resolved. A collapsible task summary shows workers, questions, results and cancellation in the owner's conversation. Real tool approvals and secure credential cards also appear there; Bots cannot approve themselves or see secret values.

The adapter persists task ownership, questions and outgoing results in `mek-bot/state.json`. Queued decisions survive restarts. Uncertain deliveries are reconciled against inboxes and durable history before retrying; an unreadable history stays explicitly uncertain. New ownership applies to new delegations; old upstream handoffs are not silently reclassified. Coordination is installed only by `mek.js`; the retained upstream entry keeps its original behavior.

## Team operations

The **Team** surface brings task history, important activity, policies, project facts and reusable workflows together.

- **Supervisor awareness:** choose a supervisor and per-Bot summary sharing. Explicit task summaries are shared by default; routine progress is recorded without a supervisor call, while blockers, failures and essential decisions receive deduplicated notices. Direct department work retains its owner. Private transcripts are not harvested. Notifications and sharing are separate controls; already-delivered history cannot be revoked.
- **Reliable delivery:** state transitions and outgoing messages persist together. Delegated groups track each member through questions, approvals, delayed results and revisions. Failed, cancelled or uncertain work cannot pass as success. Declared criteria require individual evidence before acceptance. Task artifacts open from their producing session.
- **Execution policy:** select general, coding or custom responsibilities and disabled tools per Bot; set task parallelism, revision, deadline and token limits. Limits apply before the next model request or tool dispatch; in-flight output may exceed a token limit. Missing provider usage stays unknown; external service prices are not estimated.
- **Resource coordination:** recognized workspace writers, browser tools and explicitly bound account tools claim exclusive resources. Stale leases remain exclusive until released. This is cooperative coordination, not a sandbox for arbitrary shell commands, background processes or external clients. Use separate workspaces/accounts when isolation is required.
- **Project facts:** users define sharing scopes; members deliberately submit sourced, versioned facts. Conflicts remain visible until resolved, old versions remain available, and expiry is explicit. Private memory and credentials are not auto-imported.
- **Reusable workflows:** save inputs, instructions and acceptance checks; complete and accept a validation run before activating that version. Edits create new drafts. Runs reuse the task coordinator; scheduled execution uses existing DSH automation without a second Bot scheduling menu.
- **Browser observation and takeover:** inspect an already-open Bot browser, explicitly take control and return it. Bot input pauses during human control. Observation never launches a browser. An available browser capability is required; password fields are masked in screenshots and input text is not added to task records.

Automated acceptance uses a local scripted model. It verifies system behavior, not real-model judgment or business correctness; evidence and unresolved issues remain available for review.

## Install

Verified with DSH **0.2.2-alpha.2**, Node.js 24 and current Chromium. The browser must support CSS `@scope`.

```sh
cd ds-bot
npm ci
npm run build
npm pack --ignore-scripts
dsh plugin --profile web add -w ./dsh-mek-bot-0.2.1.tgz
```

Enable the bundle and restart DSH. Do not enable the original `ds-bot` bundle alongside it. Use a package archive for production, never a source link. Keep `autoInstallPeers: false` in the profile; the DSH loader supplies the optional host API peers. Do not install duplicate Cordis, scope, tools or LLM cores.

Browser support includes the optional Playwright dependency and requires a local Chromium/Chrome executable. For example on Linux, adjust the executable path to your installation:

```yaml
- id: mek-bot
  config:
    browserPlugin: refs
    browserHeadless: true
    browserExecutablePath: /usr/bin/google-chrome
```

A service restart closes in-process browsers. Per-Bot login profiles remain; interrupted browser handoffs become blocked results for their original owner and require an explicit retry instead of automatic browser action replay.

## Data and boundaries

Team state is saved under `DSH_HOME/mek-bot`, separately from upstream's `DSH_HOME/bot`. Session history stays in DSH. Uninstalling leaves both in place. The bundle does not change global search, presets or native chat settings, and team tools are active only for team-owned sessions.

The native adapter scopes Bot CSS, portals, DOM reads and popup coordinates to its own pane. It does not replace browser globals or patch DSH. Bot dialogs reuse upstream components; group history pages the durable Session log rather than the bounded model-context log.

## Develop and update upstream

The original source layout, Apache license and public Git ancestry are retained. The baseline is pinned in [.makeepoch/upstream.json](https://github.com/MakeEpoch/dsh-mek-bot/blob/main/.makeepoch/upstream.json). Development dependencies are installed independently in `ds-bot/dev/harness`.

```sh
cd ds-bot
npm ci
npm run harness
npm run build
npm test
node scripts/build-client.mjs --check
npm run lint
```

See [integration boundaries and merge procedure](https://github.com/MakeEpoch/dsh-mek-bot/blob/main/docs/makeepoch-integration.md). The retained desktop/Docker code is upstream reference material, not this plugin's release entry. Original documentation remains in [README.upstream.md](https://github.com/MakeEpoch/dsh-mek-bot/blob/main/README.upstream.md).

## License

[Apache-2.0](LICENSE), with [upstream and third-party notices](NOTICE) preserved. This is an independent community integration, not an official DeepSeek product.
