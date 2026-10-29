// MakeEpoch's coexistence entry. The upstream host stays independently mergeable.
import { join } from 'node:path'
import { createRuntime, inject } from './index.js'
import { dshHomeOf } from './src/host/folders.js'

export { inject }
export const name = 'dsh-mek-bot'
export function apply(ctx, config = {}) {
  createRuntime(ctx, {
    ...config,
    home: config.home ?? join(dshHomeOf(process.env.DSH_HOME), 'mek-bot'),
    isolateTools: true,
    autoGreet: false,
    updateCheck: false,
  })
}
