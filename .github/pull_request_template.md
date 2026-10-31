<!--
Base branch: dev. Hotfixes and releases only: main.
目标分支选 dev。只有热修和发版才选 main。
-->

## Issue

Fixes #

## What changed / 改了什么



## Changelog

<!-- One sentence that users will notice, or "none". Do not edit CHANGELOG.md. / 一句用户能看到的变化，没有写「无」。不要改 CHANGELOG.md。 -->



## How I checked it / 怎么验证的

- [ ] `npm test` (in `ds-bot/`)
- [ ] `node scripts/build-client.mjs --check`
- [ ] `npm run lint`
- [ ] Smoke test, for changes to `index.js` or `src/host/` / 改了 `index.js` 或 `src/host/` 时跑冒烟测试
- [ ] Screenshot attached, for interface changes / 界面改动已附截图
- [ ] UI changes: applicable cases and real-browser evidence from `docs/dev/mek-ui-testing.md`; upstream merges also include isolated DSH integration. / UI 改动附测试方案中的相关用例及真实浏览器证据，合并上游另附隔离 DSH 验收。

### Downstream documentation and evidence / 下游文档与证据

<!-- Give document paths, test case IDs, source/bundle version or hash, environment, results and evidence paths. Distinguish fixtures from DSH integration and installed-package checks. Explain skipped cases; do not claim unrun cases passed. For docs-only changes, record link/source/root-package consistency review. / 填文档路径、用例编号、源码/产物版本或哈希、环境、结果与证据路径，区分夹具、DSH 集成与安装包验证；说明跳过原因，不把未执行写成通过。纯文档变更填链接、代码依据及根/包内副本复核。 -->

- Documentation updated / 已更新文档：
- Verification scope and results / 验证范围与结果：
- Skipped or unknown / 跳过与未知：

## Checklist / 检查

- [ ] One issue, one subject. / 只做一件事。
- [ ] Features, changed flows and upstream adaptations update the Chinese README feature inventory, per-version merge records and applicable integration/design/UI-test documents in this PR. / 新功能、流程变化及上游适配已在本 PR 同步更新中文版 README 特性与差异、版本合并记录和相关集成、设计、UI 测试文档。
- [ ] `src/client/` changed → `npm run build` ran and `client.js` is committed. / 改了 `src/client/` 就已重新 build 并提交 `client.js`。
- [ ] No keys, tokens or personal data, also in screenshots. / 没有密钥、token 或个人信息，截图里也没有。
- [ ] No AI tool as author or `Co-authored-by`. / 没有把 AI 工具写成作者或 `Co-authored-by`。
