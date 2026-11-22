import { useSyncExternalStore } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { TIMELINE_CONFLICTS } from '../activation.ts'

export function showConflict(ctx: Context, kind: keyof typeof TIMELINE_CONFLICTS): void {
  function TimelineConflict() {
    const locale = useSyncExternalStore(
      listener => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot(),
    )
    const zh = locale.active.startsWith('zh')
    const title = kind === 'official'
      ? (zh ? '官方时间线已启用' : 'Official Timeline is enabled')
      : (zh ? '独立时间线已启用' : 'Standalone Timeline is enabled')
    const navigation = ctx.get('pluginNavigation')
    return <section className="mek-timeline-conflict" role="status">
      <strong>{title}</strong>
      <p>{zh
        ? '如要使用 Bot 内嵌时间线，请在插件管理器关闭当前时间线，再重启 DSH。之前保存的任务树可继续读取。'
        : 'To use Timeline inside Bot, disable the current Timeline in Plugins and restart DSH. Your saved task trees remain available.'}</p>
      {navigation && <Button onClick={() => navigation.openBundle(TIMELINE_CONFLICTS[kind])}>{zh ? '打开插件管理' : 'Open Plugins'}</Button>}
    </section>
  }
  ctx.provide('mekTimelineConflict', TimelineConflict)
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'dsh-mek-bot' }, TimelineConflict))
}
