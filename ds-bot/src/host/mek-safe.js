import { defineTool } from '@deepseek-ai/dsh-tools'
import { registerTeamTool } from './team-registration.js'
import { output } from './tools.js'
import { looksSecret } from './memory.js'

export const refuse = message => { throw Object.assign(new Error(message), { code: 'bot/refused' }) }
export const own = (table, id) => table && Object.hasOwn(table, id) ? table[id] : undefined
export const clone = value => JSON.parse(JSON.stringify(value))
export function safeText(rt, value, label, max = 8000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) refuse(`${label} must be non-empty text, at most ${max} characters.`)
  const text = value.trim()
  if (looksSecret(text) || (rt.redactTeamSummary?.(text) ?? text) !== text || /https?:\/\/[^\s/@:]+:[^\s/@]+@|[?&](?:api[_-]?key|access[_-]?token|token|password|secret)=/i.test(text)) refuse(`${label} may contain a credential. Use a secure credential request instead; nothing was saved.`)
  return text
}
export const optionalText = (rt, value, label, max) => value === undefined || value === '' ? '' : safeText(rt, value, label, max)
export function teamTool(rt, name, description, parameters, execute) {
  return registerTeamTool(rt, defineTool({ name, description, parameters, output, async execute(args, exec) {
    await rt.load()
    if (rt.readOnly() !== undefined) refuse(rt.readOnly())
    await rt.loadSecrets?.()
    const self = rt.selfOf(exec.agent?.id)
    if (!self) refuse('Only a team Bot can use this tool.')
    return JSON.stringify(await execute(args, exec, self))
  } }))
}
export async function writable(rt) {
  await rt.load()
  if (rt.readOnly() !== undefined) refuse(rt.readOnly())
  await rt.loadSecrets?.()
}
