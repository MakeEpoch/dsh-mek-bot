import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'

export async function bundleTimeline(root) {
  const base = { absWorkingDir: root, bundle: true, target: 'es2022', write: false, charset: 'utf8' }
  const [host, client] = await Promise.all([
    build({ ...base, entryPoints: ['timeline/src/index.ts'], format: 'esm', platform: 'node', packages: 'external' }),
    build({ ...base, entryPoints: ['timeline/src/client/index.ts'], format: 'cjs', platform: 'browser', jsx: 'automatic',
      external: ['react', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-primitives', 'zod'],
      alias: { '@deepseek-ai/dsh-util-crypto': './timeline/src/client/uuid.ts' },
      loader: { '.css': 'empty' },
    }),
  ])
  const css = readFileSync(join(root, 'timeline/src/client/timeline.css'), 'utf8')
  const header = '// Generated from timeline/src by npm run build.\n'
  return {
    'timeline/host.js': header + host.outputFiles[0].text,
    'timeline/client.js': header + `window.__ModuleLoader__.load({
  id: 'dsh-mek-bot-timeline',
  factory: require => {
    const module = { exports: {} }
${client.outputFiles[0].text.trimEnd()}
    return Object.defineProperty({ ...module.exports }, Symbol.toStringTag, { value: 'Module' })
  },
  meta: () => ({ stylesheets: { 'src/client/timeline.css': { text: () => ${JSON.stringify(css)} } } }),
})\n`,
  }
}
