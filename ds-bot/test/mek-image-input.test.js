import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { imageFiles, readImages } from '../../app/ui/src/image-input.js'
import { promptContent } from '../src/host/channel.js'

test('clipboard images use one source in clipboard order and ordinary text stays a native paste', () => {
  const first = { type: 'image/png', name: 'first.png' }, second = { type: 'image/jpeg', name: 'second.jpg' }
  assert.deepEqual(imageFiles({ items: [first, second].map(file => ({ kind: 'file', type: file.type, getAsFile: () => file })), files: [first, second] }), [first, second])
  assert.deepEqual(imageFiles({ items: [], files: [second] }), [second])
  assert.deepEqual(imageFiles({ items: [{ kind: 'string', type: 'text/plain' }] }), [])
})

test('image batches validate format and projected DSH limits before reading any bytes', async () => {
  await assert.rejects(readImages([{ type: 'image/svg+xml', size: 5 }], [], null), /PNG/)
  const png = { type: 'image/png', size: 10 }
  await assert.rejects(readImages([png], [], { maxImageBytes: 9 }), /size limit/)
  await assert.rejects(readImages([png], [{ bytes: 2 }], { maxImagesPerMessage: 1 }), /Too many/)
  await assert.rejects(readImages([png], [{ bytes: 2 }], { maxMessageImageBytes: 11 }), /message size/)
})

test('native send content keeps encoded images in order, supports image-only input and strips untrusted reference fields', () => {
  const images = [{ mediaType: 'image/png', data: 'AAAA', name: 'clip.png', attachment: { attachmentId: 'not-owned' } }, { mediaType: 'image/webp', data: 'BBBB' }]
  const content = promptContent({ text: ' check this ', images })
  assert.deepEqual(content.map(block => block.type), ['image', 'image', 'text'])
  assert.equal(content[0].data, 'AAAA')
  assert.equal(content[0].attachment, undefined)
  assert.equal(content[2].text, 'check this')
  assert.equal(promptContent({ images }).length, 2)
  assert.deepEqual(promptContent({ text: '  ' }), [])
  assert.throws(() => promptContent({ images: {} }), /Invalid image/)
})

test('an HTTP LAN page without crypto.randomUUID still generates a valid submission identity', async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../../app/ui/src/image-input.js', import.meta.url))], bundle: true, write: false, format: 'cjs', platform: 'browser' })
  const module = { exports: {} }
  runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, crypto: { getRandomValues: bytes => { bytes.fill(7); return bytes } } })
  assert.match(module.exports.requestId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})
