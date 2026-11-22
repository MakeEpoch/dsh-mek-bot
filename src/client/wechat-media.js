import { createElement as h } from 'react'
import { t } from './i18n.js'

export { wechatMessage } from '../shared/wechat-media.js'

export function WechatAttachments({ files }) {
  if (!files.length) return null
  return h('div', { className: 'bt-wechat-attachments' }, files.map((file, index) => h('details', { key: index, className: 'bt-wechat-attachment' },
    h('summary', null, h('span', null, t(file.mediaType.startsWith('audio/') ? 'Voice attachment' : file.mediaType.startsWith('image/') ? 'Image attachment' : 'File attachment')),
      h('span', { className: 'bt-wechat-file-name' }, file.mediaType.startsWith('audio/') ? t('Attachment details') : file.name)),
    h('div', { className: 'bt-wechat-file-details' }, h('span', null, `${file.name} · ${file.mediaType} · ${Math.ceil(file.bytes / 1024)} KB`), h('code', null, file.path)))))
}

export const WECHAT_MEDIA_CSS = `
.bt-history-images{display:flex;flex-wrap:wrap;gap:8px;max-width:100%;margin:6px 0}
.bt-history-images img{max-width:min(240px,100%);max-height:280px;object-fit:contain;border-radius:12px}
.bt-wechat-attachments{display:flex;flex-direction:column;gap:6px;max-width:100%;margin-top:8px;white-space:normal}
.bt-wechat-attachment{min-width:0;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:10px;font-size:12px;line-height:18px}
.bt-wechat-attachment summary{cursor:pointer;padding:8px 10px;overflow-wrap:anywhere}
.bt-wechat-attachment summary:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px;border-radius:10px}
.bt-wechat-file-name{margin-inline-start:10px;opacity:.65}
.bt-wechat-file-details{display:flex;flex-direction:column;gap:6px;padding:0 10px 10px;opacity:.8;overflow-wrap:anywhere}
.bt-wechat-file-details code{font-size:11px;white-space:pre-wrap;word-break:break-all}
`
