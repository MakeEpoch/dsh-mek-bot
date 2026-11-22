export function artifactOf(value, sessionId) {
  const raw = typeof value === 'string' ? { path: value } : value ?? {}
  const path = String(raw.path ?? raw.url ?? '').trim()
  if (!path || path.length > 8192 || path.includes('\0') || /[\r\n]/.test(path)) return null
  const web = /^https?:\/\//i.test(path)
  if (web) {
    try { const parsed = new URL(path); if (parsed.username || parsed.password) return null } catch { return null }
  } else if (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) return null
  return { path, web, sessionId, name: raw.name ?? path.split(/[\\/]/).filter(Boolean).pop() ?? path }
}
export function fileService(ctx) { return ctx?.get?.('remote.workspaceFiles') ?? ctx?.remote?.workspaceFiles }
export async function readArtifact(ctx, artifact, offset, signal) {
  const service = fileService(ctx)
  if (!artifact.sessionId || typeof service?.read !== 'function') throw new Error('This host cannot preview this file here.')
  const result = await service.read(artifact.sessionId, artifact.path, { offset, limit: 100 }, signal)
  if (!result.ok) throw new Error(result.error?.message ?? 'The file could not be read.')
  return result.value
}
export async function downloadArtifact(ctx, artifact, signal) {
  const service = fileService(ctx)
  if (!artifact.sessionId || typeof service?.readBytes !== 'function') throw new Error('This host cannot download this file here.')
  const result = await service.readBytes(artifact.sessionId, artifact.path, {}, signal)
  if (!result.ok) throw new Error(result.error?.message ?? 'The file could not be downloaded.')
  if (!result.value.eof || result.value.offset !== 0) throw new Error('The host returned only part of this file; no download was created.')
  return result.value
}
