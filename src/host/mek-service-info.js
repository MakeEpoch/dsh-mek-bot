// Report only this Web runtime and a small set of properties of its own user unit.
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)
export async function serviceInfo(ctx) {
  const result = { pid: process.pid, uptimeSeconds: Math.floor(process.uptime()) }
  const advertised = ctx.get?.('webApp')?.getAdvertisedUrl()
  if (advertised) {
    const url = new URL(advertised)
    if (['http:', 'https:'].includes(url.protocol)) result.webUrl = url.origin + url.pathname
  }
  if (process.platform !== 'linux') return result
  const membership = await readFile('/proc/self/cgroup', 'utf8').catch(() => '')
  const unit = membership.match(/\/user@[0-9]+\.service\/(?:[^\n/]+\/)*?([\w@.-]+\.service)(?:\/|$)/m)?.[1]
  if (!unit) return result
  result.userUnit = unit
  try {
    const { stdout } = await run('/usr/bin/systemctl', ['--user', 'show', '--property=ActiveState,SubState,UnitFileState,ActiveEnterTimestamp,MainPID', '--', unit], { timeout: 3000, maxBuffer: 8192 })
    result.systemd = Object.fromEntries(stdout.trim().split('\n').filter(line => line.includes('=')).map(line => {
      const split = line.indexOf('=')
      return [line.slice(0, split), line.slice(split + 1)]
    }))
  } catch { result.unitStatusAvailable = false }
  return result
}
