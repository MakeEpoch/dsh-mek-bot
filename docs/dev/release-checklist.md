# 插件发版前检查

1. 在仓库根目录运行 `npm run build`、`npm test`、`node scripts/build-client.mjs --check` 和 `npm run lint`。
2. 从干净的候选 Git 签出运行 `npm ci` 和 `npm run build`，再执行 `npm pack --ignore-scripts`。核对包内的 `package.json` 声明了 `dsh.bundle.patch`，并包含 `cordis.patch.yml`、`mek.js`、`client.js`、`office.js` 和具名的 `node_modules/dsh-mek-bot-timeline`。
3. 对应源码提交运行 `npm run release:tag -- /绝对路径/dsh-mek-bot-<版本>.tgz <源码提交>`。脚本核对压缩包，创建本地 `mek-v<版本>` 标签。标签所指的发布提交以源码提交为父提交，包含 GitHub 源码归档所需的 Timeline 运行文件。`main` 保持源码提交。
4. 在隔离 Web profile 分别安装候选 `.tgz` 和从候选标签生成的 Git 源码归档。确认一次安装即可解析 Bot 与 MEK Timeline 两个组件，并实际加载两者的候选客户端。另用启用了官方 Timeline 的 profile 核对提示和切换流程。
5. 用本地模拟模型在浏览器验证原生入口、单聊回复、群聊、派工与结果回流。按[界面验收方案](mek-ui-testing.md)补充受影响功能和宽窄布局的检查。
6. 记录源码提交、标签提交、DSH 版本、安装来源、产物哈希、结果和未测范围。
7. 推送源码分支和新标签后，在隔离 profile 实际粘贴 `github:MakeEpoch/dsh-mek-bot#mek-v<版本>`，核对两个组件和版本。将这个地址放到 GitHub Release 更新日志末尾，再附上同版本 `.tgz` 安装包。
