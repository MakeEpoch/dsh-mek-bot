# 插件发版前检查

1. 在仓库根目录运行 `npm run build`、`npm test`、`node scripts/build-client.mjs --check` 和 `npm run lint`。
2. 从干净的候选 Git 签出运行 `npm ci` 和 `npm run build`，再执行 `npm pack --ignore-scripts`。核对包内的 `package.json` 声明了 `dsh.bundle.patch`，并包含 `cordis.patch.yml`、`mek.js`、`client.js`、`office.js` 和具名的 `node_modules/dsh-mek-bot-timeline`。
3. 在隔离 Web profile 通过 DSH 安装该候选压缩包。确认一次安装即可解析 Bot 与 MEK Timeline 两个组件，并实际加载两者的候选客户端。另用启用了官方 Timeline 的 profile 核对提示和切换流程。
4. 用本地模拟模型在浏览器验证原生入口、单聊回复、群聊、派工与结果回流。按[界面验收方案](mek-ui-testing.md)补充受影响功能和宽窄布局的检查。
5. 记录 Git 提交、DSH 版本、安装来源、产物哈希、结果和未测范围。
6. 在 GitHub Release 更新日志末尾附上可直接粘贴到 DSH 插件管理器安装框的地址，并在隔离 profile 验证它安装的是该版本。含具名 Timeline 组件的发行包使用 Release 附件的完整 `.tgz` 下载地址。
