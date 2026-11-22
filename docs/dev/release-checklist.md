# 插件发版前检查

1. 在仓库根目录运行 `npm run build`、`npm test`、`node scripts/build-client.mjs --check` 和 `npm run lint`。
2. 执行 `npm pack --ignore-scripts`，核对包内的 `package.json` 声明了 `dsh.bundle.patch`，并包含 `cordis.patch.yml`、`mek.js`、`client.js` 和 `office.js`。
3. 在隔离 Web profile 分别从候选压缩包和候选 Git 提交安装。确认 DSH 将 `dsh-mek-bot` 识别为组合包，并实际加载候选客户端。
4. 用本地模拟模型在浏览器验证原生入口、单聊回复、群聊、派工与结果回流。按[界面验收方案](mek-ui-testing.md)补充受影响功能和宽窄布局的检查。
5. 记录 Git 提交、DSH 版本、安装来源、产物哈希、结果和未测范围。
