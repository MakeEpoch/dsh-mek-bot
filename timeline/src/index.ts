import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-client-connection'
import { Config, liveConfig } from './config.ts'
import type { PluginConfig } from './config.ts'
import { registerProjection } from './projection.ts'
import { installTools } from './tools.ts'
import { installReports } from './reports.ts'
import { installGuidance } from './guidance.ts'
import { installReminders } from './reminders.ts'
import { TimelineStorage } from './storage.ts'
import type { OutputLanguage } from './policy.ts'
import { installCommand } from './command.ts'
import { installDelegation, planningOwner } from './delegation.ts'
import { TIMELINE_ACTIVATION_CHANNEL, TIMELINE_ACTIVATION_METHOD, TIMELINE_CONFLICTS } from './activation.ts'
import type { TimelineActivation } from './activation.ts'
import { publishGroupPlan } from './group-plan.ts'
import type { GroupPlan } from './group-plan.ts'
import type { Session } from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mekTimelineShared: true
    mekTimelineGroupPlan: (session: Session, plan: GroupPlan) => Promise<void>
  }
}

export { Config }
export const name = 'timeline'
export const inject = [
  'loader',
  'agents',
  'sessions',
  'sessionProjections',
  'tools',
  'llm',
  'systemPrompt',
]

/**
 * Install Timeline for the profile's agents and client.
 * @param ctx Plugin context.
 * @param input Loader-owned Timeline settings.
 */
export async function apply(ctx: Context, input: PluginConfig): Promise<void> {
  const packages = new Set([...ctx.loader.entries()].filter(entry => !entry.disabled).map(entry => entry.options.name.replace(/^cordis:/u, '')))
  const activation: TimelineActivation = packages.has(TIMELINE_CONFLICTS.official) ? 'official'
    : packages.has(TIMELINE_CONFLICTS.standalone) ? 'standalone' : 'active'
  ctx.inject(['connection', 'webServer'], scope => {
    scope.connection.rpc.handle(TIMELINE_ACTIVATION_CHANNEL, method => {
      if (method === TIMELINE_ACTIVATION_METHOD) return { ok: true, value: activation }
      return { ok: false, error: { code: 'timeline/unknown-method', message: 'Unknown MEK Timeline method.', details: {} } }
    })
  })
  if (activation !== 'active') {
    ctx.logger.info('MEK Timeline is waiting for %s to be disabled. Turn it off, then restart DSH to switch.', TIMELINE_CONFLICTS[activation])
    return
  }
  let browserLanguage: OutputLanguage | undefined
  const config = liveConfig(input, () => {
    const locale = ctx.get('settings')?.describe({ redactSecrets: true }).find(item => item.ns === 'locale')
    const value: unknown = locale?.value
    return typeof value === 'object' && value !== null && 'preference' in value &&
      typeof value.preference === 'string'
      ? value.preference
      : browserLanguage ?? Intl.DateTimeFormat().resolvedOptions().locale
  })
  const projection = await registerProjection(ctx)
  const storage = new TimelineStorage(ctx, projection, config, (language) => { browserLanguage = language })
  installTools(ctx, config, storage)
  ctx.provide('mekTimelineGroupPlan', (session, plan) => publishGroupPlan(storage, session, plan))
  ctx.provide('mekTimelineShared', true)
  const owns = planningOwner(ctx)
  installDelegation(ctx, owns)
  installCommand(ctx, storage)
  installGuidance(ctx, config, storage, owns)
  installReminders(ctx, config, storage, owns)
  installReports(ctx, config, storage, owns)
}
