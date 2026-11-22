# AGENTS.md

Instructions for AI coding agents that work on this repository. Human contributors: see [CONTRIBUTING.md](CONTRIBUTING.md), which has the same rules with more detail.

## MakeEpoch fork: read first

This checkout ships **dsh-mek-bot, a native DSH plugin**, not the upstream standalone application. For product shape, integration and acceptance decisions, follow [project overview and differences](README.md), [version merge records and documentation rules](docs/fork-vs-upstream.md), [integration boundaries](docs/makeepoch-integration.md) and the [UI test plan](docs/dev/mek-ui-testing.md).

- Keep one native Bot launcher, a top conversation list and scene-local UI. DSH owns its sidebar, ordinary sessions, settings and scheduling. Shared upstream UI used by the plugin lives in `src/client/bot-view/`.
- Preserve downstream task ownership, review, navigation restoration, team operations and shared-feed behavior when evaluating upstream changes. Evaluate the design ideas against this plugin’s product goals and host APIs. Record the applied design and observed verification.
- **Every new feature, changed user flow, capability restriction or upstream adaptation must update its applicable documentation in the same change.** Maintain the current feature inventory and upstream differences in the single Chinese `README.md`, which is packaged directly, and keep `README.zh.md` as a compatibility link. Record upstream changes and adoption per version in `docs/fork-vs-upstream.md`; update integration/design notes when contracts change and the UI test matrix when visible behavior changes. Remove obsolete descriptions. A feature is not done while its documentation describes the old behavior.
- UI changes require relevant automated checks plus real-browser evidence under the UI test plan. Upstream merges also require an isolated DSH integration pass. Record the exact tested source/bundle, environment, skipped cases and remaining unknowns. A fixture pass is not a DSH installation or release pass.
- For the MakeEpoch fork, merge completed changes into local `main` once verification passes or after a successful authorized deployment. Verify that `main` contains the resulting commits. Follow the user's instructions for any push or deployment.
- For documentation-only changes, check links, commands against source, packaged documentation and factual status. Do not rerun model/UI suites unless the documentation work exposes a behavior change that needs validation.

## What this project is

dsh-mek-bot is a native DSH interface for teams of long-lived Bots. The repository root is the installable plugin package. It draws heavily on DS Bot’s runtime and UI code.

The Bot team:

- Every Bot is a long-lived identity whose work runs in DSH Sessions: one for its own chat, one for each group it is in, and a fresh one when the context fills up (earlier ones stay readable). Every turn runs through the normal DSH agent loop, tools and model routes.
- The team works together: Bots message each other, share group chats and can see what the other Bots are doing. Each Bot still runs on its own and does not disturb the others.
- Bots have clear, different roles. A Main Bot has the highest rights: it creates, changes and removes other Bots. Other Bots do not get these rights. There can be more than one Main Bot.
- Users customize each Bot (name, role label, instructions, model, character).
- Behavior must be reliable: a Bot acts on evidence, stays inside its goal, and its results can be checked.

## Hard rules

1. **Build on DSH; never patch it.** Bot features use the documented plugin APIs. Never patch DeepSeek Harness or depend on files inside a DSH install. If something is missing in DSH, stop and say so; do not work around it with a patch.
2. **No secrets.** Never write, print or commit API keys, tokens, cookies or `DSH_HOME` contents. Use the mock model (`dev/mock-llm.mjs`) for tests; it needs no key.
3. **Only original material.** Do not copy code, text, icons, logos or graphics from other products or websites. Code under a license compatible with Apache 2.0 is the only exception: say where it comes from and add its notice to the `NOTICE` file.
4. **`client.js` is generated.** Change `src/client/`, then run `npm run build` and commit both files. Never edit `client.js` by hand.
5. **Do not touch the user's own DSH data.** The test bench keeps its data in `.dsh-test-<name>/`. Never point a test at `~/.dsh`, at the desktop app's data or at a DSH that the user runs.

## Commands

Run at the repository root. The unit tests and the linter load the `@deepseek-ai/*` packages from `dev/harness/`, which `npm run harness` installs from npm at the DSH version in `dev/harness/package.json`. `DSH_HARNESS` points them at another install or at a DeepSeek Harness checkout instead. The isolated Web test bench uses `dsh` on PATH or the `DSH_CLI` override.

```sh
npm ci                                 # build tool only (esbuild)
npm run harness                        # once: the DSH packages for the tests and the linter
npm run build                          # src/client → client.js
npm test                               # unit tests; also fail if client.js is stale
node scripts/build-client.mjs --check  # client.js matches src/client
npm run lint                           # oxlint
npm run check -- --only smoke         # isolated DSH Web with a local mock
```

A change is done when `npm test`, the `--check` and `npm run lint` pass; CI runs them on every pull request. Run the smoke test as well for changes to `index.js` or `src/host/`. Use a free port for each bench, and stop every bench and process that you started.

## Branches, pull requests and issues

The upstream contribution workflow is in [CONTRIBUTING.md](CONTRIBUTING.md#how-we-work). For MakeEpoch fork integration, follow the local `main` rule above.

- Start work from the latest `dev` on a branch named `fix/<issue>-<name>`, `feat/<issue>-<name>`, `docs/<name>` or `chore/<name>`. Never start a branch name with `dev/`. Open the pull request into `dev`, not `main`; only releases and hotfixes go into `main`.
- Bring a branch up to date with `git merge dev`. Never rebase a pushed branch and never force-push.
- Fill in the pull request template. Link the issue with `Fixes #<number>`; a bug fix names the bug it fixes. Write the user-visible change in the Changelog field, and do not edit `CHANGELOG.md`.
- Do not start work on an issue or pull request with the `maintainer` label; it waits for the maintainer. Do not take an issue that someone else is assigned to.
- Before you change behavior, read the design for it in `docs/plans/` (and `docs/vision.md`); for interface work also `docs/design/ui-standard.md`. A change to a decided design needs the maintainer; a new large feature adds its design note to the same pull request.
- Do not close an issue without evidence: the pull request or commit that fixed it, the issue it duplicates, or the reason it will not be fixed.
- To triage issues, follow [.agents/skills/issue-triage/SKILL.md](.agents/skills/issue-triage/SKILL.md).
- To record a demonstration GIF for an interface change, follow [.agents/skills/record-browser-gif/SKILL.md](.agents/skills/record-browser-gif/SKILL.md).

## Layout

- `index.js` and `src/host/`: the server side (roster and store, tools, turns and delivery, groups, conversation parts and the search index, images, the browser bridge, the `api/bot` channel).
- `src/client/`: the browser side (sidebar, chat, panels, themes, characters, the Bot browser panel).
- `web-search.js`: the `auto` web-search provider, independent of the Bot team code.
- `test/`: unit tests and fixtures. `dev/`: the DSH packages for the tests (`harness/`), mock model, test bench, smoke test and character generator.

## Style

- Follow the code around your change. Keep functions small and names plain.
- Write a comment only when the reason is not clear from the code: a hidden constraint, an invariant, a workaround. Do not describe what the code does.
- Commit messages in English, imperative subject, the reason in the body. Keep commits small.
- The person who asked for the change is the commit author. Do not set an AI agent or bot as author or committer, and do not add `Co-authored-by` lines for one.
- User-facing text in the plugin is English. Project documentation uses one Chinese README as the source of truth; the package uses that same file and retains the README.zh.md link. Do not create a parallel English project overview.
