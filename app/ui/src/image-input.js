import { t } from '../../../ds-bot/src/client/i18n.js'

const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export function imageFiles(transfer) {
  const items = [...(transfer?.items ?? [])].filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean)
  return items.length ? items : [...(transfer?.files ?? [])].filter(file => file.type.startsWith('image/'))
}

export function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function readImages(files, existing, limits) {
  const types = limits?.mediaTypes ?? TYPES
  if (files.some(file => !TYPES.includes(file.type) || !types.includes(file.type))) throw new Error(t('Only PNG, JPEG, WebP and GIF images are supported.'))
  if (limits?.maxImageBytes && files.some(file => file.size > limits.maxImageBytes)) throw new Error(t('Image exceeds the size limit.'))
  if (limits?.maxImagesPerMessage && existing.length + files.length > limits.maxImagesPerMessage) throw new Error(t('Too many images.'))
  if (limits?.maxMessageImageBytes && [...existing, ...files].reduce((sum, file) => sum + (file.size ?? file.bytes), 0) > limits.maxMessageImageBytes) throw new Error(t('Images exceed the message size limit.'))
  return Promise.all(files.map(file => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(t('Could not read this image.')))
    reader.onload = () => {
      const preview = String(reader.result)
      resolve({ id: requestId(), mediaType: file.type, data: preview.slice(preview.indexOf(',') + 1), name: file.name || 'image', bytes: file.size, preview })
    }
    reader.readAsDataURL(file)
  })))
}
