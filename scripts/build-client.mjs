// Builds client.js, the browser half, from the modules in src/client.
//
//   node scripts/build-client.mjs           writes client.js
//   node scripts/build-client.mjs --check   exits 1 when client.js differs from a fresh build
//
// client.js is committed, so `link:` and git installs need no build step. dsh loads it as
// a classic script; the wrapper mirrors packages/client/tsdown.client.ts in
// deepseek-harness: `require` resolves the shell-seeded platform modules (react,
// react-dom, ui-primitives, ...), which therefore stay external.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { bundleTimeline } from './build-timeline.mjs'

const PLUGIN = dirname(dirname(fileURLToPath(import.meta.url)))
const OUTPUT = join(PLUGIN, 'client.js')
const PLATFORM_MODULES = ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives']

export async function bundleClient() {
  const result = await build({
    // Region comments name sources relative to the plugin, wherever the script runs from.
    absWorkingDir: PLUGIN,
    entryPoints: ['src/client/mek/index.jsx'],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    external: PLATFORM_MODULES,
    loader: { '.css': 'text' },
    plugins: [{
      name: 'native-bot-environment',
      setup(builder) {
        const local = join(PLUGIN, 'src/client/mek')
        builder.onResolve({ filter: /^react-dom$/ }, args => args.importer === join(local, 'portal.js') ? { path: 'react-dom', external: true } : { path: join(local, 'portal.js') })
        builder.onLoad({ filter: /\.js$/ }, args => {
          const upstreamView = args.path.startsWith(join(PLUGIN, 'src/client/')) && !args.path.startsWith(local)
          if (!upstreamView) return undefined
          const source = readFileSync(args.path, 'utf8')
          // Keep upstream modules on disk unchanged. Only this plugin's build
          // binds their DOM reads, popovers and coordinates to the native scene.
          const contents = `import { scopedDocument as document, scopedWindow as window, scopedRect as mekRect, scopedPoint as mekPoint } from ${JSON.stringify(join(local, 'dom.js'))};\n`
            + source.replace(/(\b[\w$]+(?:\.[\w$]+)*)(?:\?\.|\.)getBoundingClientRect\(\)/g, 'mekRect($1)').replace(/(\b[\w$]+(?:\.[\w$]+)*)\.clientX\b/g, 'mekPoint($1).x').replace(/(\b[\w$]+(?:\.[\w$]+)*)\.clientY\b/g, 'mekPoint($1).y')
          return { contents, loader: 'js', resolveDir: dirname(args.path) }
        })
      },
    }],
    // Every source declaration ships, used or not, as in the hand-written bundle.
    treeShaking: false,
    // Readable for debugging in the browser: no minification, and Chinese text stays text.
    charset: 'utf8',
    write: false,
    logLevel: 'silent',
  })
  if (result.warnings.length > 0) throw new Error(`esbuild warnings:\n${result.warnings.map(warning => warning.text).join('\n')}`)
  return [
    '// Generated from src/client by `npm run build` (scripts/build-client.mjs). Do not edit by hand.',
    'window.__ModuleLoader__.load({',
    '  id: \'dsh-mek-bot\',',
    '  factory: (require) => {',
    'const module = { exports: {} }',
    result.outputFiles[0].text.trimEnd(),
    // The loader gets a plain exports object tagged as a module, as the tsdown preset
    // emits, rather than esbuild's getter-based `__esModule` object.
    'return Object.defineProperty({ ...module.exports }, Symbol.toStringTag, { value: \'Module\' })',
    '  },',
    '})',
    '',
  ].join('\n')
}

const OFFICE_OUTPUT = join(PLUGIN, 'office.js')

export async function bundleOffice() {
  const result = await build({
    absWorkingDir: PLUGIN,
    entryPoints: ['src/office/cli.js'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    charset: 'utf8',
    write: false,
    logLevel: 'silent',
    banner: {
      js: '#!/usr/bin/env node\n// Generated from src/office by `npm run build` (scripts/build-client.mjs). Do not edit by hand.',
    },
  })
  if (result.warnings.length > 0) throw new Error(`esbuild warnings:\n${result.warnings.map(warning => warning.text).join('\n')}`)
  return result.outputFiles[0].text
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const next = await bundleClient()
  const office = await bundleOffice()
  const timeline = await bundleTimeline(PLUGIN)
  const outputs = [[OUTPUT, next], [OFFICE_OUTPUT, office], ...Object.entries(timeline).map(([file, content]) => [join(PLUGIN, file), content])]
  if (process.argv.includes('--check')) {
    const stale = outputs.filter(([file, content]) => {
      try { return readFileSync(file, 'utf8') !== content } catch { return true }
    })
    if (stale.length > 0) {
      console.error(`Generated files are stale: ${stale.map(([file]) => file).join(', ')}. Run npm run build.`)
      process.exit(1)
    }
  } else {
    for (const [file, content] of outputs) writeFileSync(file, content)
  }
}
