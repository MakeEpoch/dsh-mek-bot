// MakeEpoch's coexistence entry. The upstream host stays independently mergeable.
import { join } from 'node:path'
import { createRuntime, inject } from './index.js'
import { install as installCoordination } from './src/host/mek-coordination.js'
import { dshHomeOf } from './src/host/folders.js'

export { inject }
export const name = 'dsh-mek-bot'
export function apply(ctx, config = {}) {
  const rt = createRuntime(ctx, {
    ...config,
    home: config.home ?? join(dshHomeOf(process.env.DSH_HOME), 'mek-bot'),
    isolateTools: true,
    coordinateTasks: true,
    autoGreet: false,
    updateCheck: false,
  })
  installCoordination(rt)
}
