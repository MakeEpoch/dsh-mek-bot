import { language } from '../i18n.js'
export const copy = (en, zh) => language().startsWith('zh') ? zh : en
export const when = time => time ? new Date(time).toLocaleString(language(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
