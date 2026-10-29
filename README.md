# dsh-mek-bot

[中文](README.zh.md) · [Upstream DS-Bot](https://github.com/Fei2411/DS-Bot)

MakeEpoch integration of DS-Bot for DeepSeek Harness. One **Bot** entry in DSH's sidebar opens the existing DS-Bot plugin UI in an isolated same-origin document. Its Bot creation, settings, chat and group screens are reused unchanged. The surrounding DSH interface and source code remain intact.

![DS-Bot inside DSH](docs/images/mek-bot.png)

## Install

Verified with DSH `0.2.2-alpha.2` and Node.js 24. Build and install the package archive:

```sh
cd ds-bot
npm ci
npm run build
npm pack --ignore-scripts
dsh plugin --profile web add -w ./dsh-mek-bot-0.1.0.tgz
```

Enable the bundle and restart DSH. Do not enable the original `ds-bot` bundle alongside this one. Production installs must use package archives, never source links. Keep `autoInstallPeers: false` in the DSH profile: DSH's loader supplies the optional host API peers.

## Behavior and data

Click **Bot** to use upstream DS-Bot. The outer DSH workspace and conversation controls remain available. New Bots do not automatically start a model greeting; pick a model and send a message when ready. Bot work uses your existing DSH model routes and permissions.

Team data lives in `DSH_HOME/mek-bot`, independently of upstream's `DSH_HOME/bot`. DSH keeps session history. Uninstalling the plugin leaves both in place. The bundle does not change global search, presets or themes. Team tools are activated only for team-owned sessions.

## Development

The original upstream layout and public Git ancestry are retained. The baseline is pinned in [.makeepoch/upstream.json](.makeepoch/upstream.json). The UI adapter delegates to the original plugin entry instead of copying or restructuring its components.

```sh
cd ds-bot
npm ci
npm run harness
npm run build
npm test
node scripts/build-client.mjs --check
npm run lint
```

See [integration and upstream merge boundaries](docs/makeepoch-integration.md). The preserved desktop/Docker code is upstream reference material, not this integration's release entry. Original documentation is retained in [README.upstream.md](README.upstream.md).

## License

[Apache-2.0](LICENSE), with upstream and third-party notices preserved in [NOTICE](NOTICE). This is an independent community integration, not an official DeepSeek product.
