import React, { useEffect, useRef, useState } from 'react'
import { artifactOf, downloadArtifact, fileService, readArtifact } from './artifact-data.js'
import { copy } from './copy.js'

export function ArtifactCard({ value, sessionId, ctx }) {
  const artifact = artifactOf(value, sessionId)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(null)
  useEffect(() => () => pending.current?.abort(), [])
  if (!artifact) return null
  const run = async download => {
    pending.current?.abort()
    const controller = new AbortController(); pending.current = controller
    setBusy(true); setError('')
    try {
      if (download) {
        const file = await downloadArtifact(ctx, artifact, controller.signal)
        if (controller.signal.aborted) return
        const url = URL.createObjectURL(new Blob([file.data], { type: 'application/octet-stream' }))
        const link = document.createElement('a'); link.href = url; link.download = artifact.name; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } else {
        const next = preview ? preview.offset + preview.lines : 1
        const page = await readArtifact(ctx, artifact, next, controller.signal)
        if (controller.signal.aborted) return
        if (preview && page.version !== preview.version) { setPreview(null); throw new Error(copy('The file changed. Open the preview again to read its current version.', '文件已更新，请重新打开预览以读取当前版本。')) }
        setPreview(old => ({ ...page, text: old ? `${old.text}\n${page.text}` : page.text }))
      }
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message) }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  const available = Boolean(artifact.sessionId && fileService(ctx))
  return <article className="mek-artifact">
    <div className="mek-artifact-line"><strong>{artifact.name}</strong><span title={artifact.path}>{artifact.path}</span>
      {artifact.web ? <a href={artifact.path} target="_blank" rel="noreferrer noopener">{copy('Open link', '打开链接')}</a> : <>
        <button type="button" disabled={busy || !available} onClick={() => preview ? setPreview(null) : void run(false)}>{preview ? copy('Close preview', '关闭预览') : copy('Preview', '预览')}</button>
        <button type="button" disabled={busy || !available} onClick={() => void run(true)}>{copy('Download', '下载')}</button>
      </>}
    </div>
    {!artifact.web && !available && <p>{copy('File preview requires its originating conversation and the host file service.', '文件预览需要原始对话和主机文件服务。')}</p>}
    {error && <p role="alert">{error}</p>}
    {preview && <div className="mek-artifact-preview"><pre>{preview.text}</pre>{!preview.eof && preview.offset + preview.lines <= 2000 && <button type="button" disabled={busy} onClick={() => void run(false)}>{copy('Read more', '继续读取')}</button>}{!preview.eof && preview.offset + preview.lines > 2000 && <p>{copy('Preview limit reached. Download the complete file.', '已达到预览上限，可下载完整文件。')}</p>}</div>}
  </article>
}
export function Artifacts({ values = [], sessionId, ctx }) { return <div className="mek-artifacts">{values.map((value, index) => <ArtifactCard key={typeof value === 'string' ? value : value.id ?? index} value={value} sessionId={sessionId} ctx={ctx} />)}</div> }
export const ARTIFACT_CSS = `.mek-artifact{border:1px solid var(--bt-line);border-radius:12px;padding:8px 12px;margin:8px 0;background:var(--bt-card)}.mek-artifact-line{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mek-artifact-line>span{flex:1;min-width:100px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--bt-ink-2)}.mek-artifact button,.mek-artifact a{min-height:28px;padding:4px 8px;border:1px solid var(--bt-line);border-radius:8px;background:var(--bt-main);color:var(--bt-ink);cursor:pointer}.mek-artifact-preview pre{font:12px/18px ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto}.mek-artifact p{font-size:12px;color:var(--bt-ink-2)}.mek-artifact [role=alert]{color:var(--bt-danger)}`
