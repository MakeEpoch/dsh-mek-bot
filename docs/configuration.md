# 插件配置、权限与数据

安装命令见[项目首页](../README.md#安装)。以下配置写入目标 DSH profile 的 `cordis.patch.yml`。

## 数据与配置

团队数据默认在 `DSH_HOME/mek-bot`，与上游的 `DSH_HOME/bot` 分开；聊天历史仍由 DSH Session 服务保存，卸载不会删除这些数据。可在当前用户的 `cordis.patch.yml` 中设置：

```yaml
- id: mek-bot
  config:
    mainName: 小音
    mainRole: 主助手
```

插件不改 DSH 源码、全局搜索、预设或原生聊天设置。团队工具只对团队拥有的会话生效。Bot 的 CSS、弹窗、DOM 读取与坐标限定在自己的面板内，不替换浏览器全局对象，不重复加载其他 DSH 插件。群聊记录从持久化 Session 日志分页读取，不依赖给模型看的有限上下文日志。

## 会话与跨会话权限

Bot 详情中的“当前会话权限”读取 DSH 实际权限；点击“在 DSH 中设置”打开该 Bot 当前会话，在原生输入区的权限菜单中选择模式。DSH 启用实验自动审查插件时，这里包含自动审查及其原生风险确认；返回 Bot 后状态同步。“Bot 跨会话权限”另行折叠显示，修改会应用到当前单聊、继承该权限的群聊和后续新会话，仍不把 `auto` 保存为 Bot 默认值。当前版本不支持直接在 Bot 面板内嵌 DSH 权限下拉框，因此采用明确的原生会话跳转；浏览详情不会自动切换宿主主会话。

## Bot 浏览器

浏览器功能随包提供可选 Playwright 依赖；启用前需本机 Chromium/Chrome。Linux 示例（按实际安装路径调整）：

```yaml
- id: mek-bot
  config:
    browserPlugin: refs
    browserHeadless: true
    browserExecutablePath: /usr/bin/google-chrome
```

服务重启会关闭进程内浏览器。登录资料保留在各 Bot 独立目录；等待交接的任务会明确转为阻塞并回报负责人，需确认后重开，不会自动重复网页操作。

## 启用 Bot 内嵌时间线

组合包内置从 `@deepseek-ai/dsh-timeline` `0.2.3-alpha.2` 派生的 MEK Timeline。该条目默认为关闭。用 DSH `0.2.3-alpha.2` 打开组合包时，可以在当前 profile 的 `cordis.patch.yml` 启用。`<DSH_HOME>/profiles/web/cordis.patch.yml` 对应默认 Web profile。

如果 profile 同时配置了官方 Timeline，在同一份最终配置中停用官方并启用 MEK Timeline。两个包可以同时保留在安装列表中。`config` 如有需要应完整填写，可从该 profile 的官方 Timeline 设置复制。

```yaml
- id: timeline-experimental
  name: '@deepseek-ai/dsh-timeline'
  disabled: true
- id: mek-timeline
  disabled: false
```

只有组合包的 profile 写入第二项即可。`dsh --profile web --dump-config` 可检查最终配置。重启 profile 后，打开 Bot 右侧「时间线」。要切回官方版，在同一配置中关闭 `mek-timeline` 并恢复 `timeline-experimental`。两版沿用相同的 Timeline Session 记录格式。两个条目都启用时，MEK Timeline 会报告冲突。
