import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const [archivePath, sourceRef = 'HEAD', ...extra] = process.argv.slice(2)
if (!archivePath || extra.length) {
  console.error('Usage: node scripts/create-release-tag.mjs <npm-pack.tgz> [source-ref]')
  process.exit(1)
}

const archive = resolve(archivePath)
const root = resolve(import.meta.dirname, '..')
const maxBuffer = 16 * 1024 * 1024
const git = (args, options) => execFileSync('git', args, { cwd: root, maxBuffer, ...options })
const gitText = (args, options) => git(args, options).toString().trim()
const readArchive = path => execFileSync('tar', ['-xOzf', archive, '--', `package/${path}`], { maxBuffer })
const source = gitText(['rev-parse', '--verify', '--end-of-options', `${sourceRef}^{commit}`])

function assertPackedFile(target, sourcePath = target) {
  const original = git(['show', `${source}:${sourcePath}`])
  if (!original.equals(readArchive(target))) throw new Error(`Packed file differs from ${sourcePath} in ${source}: ${target}`)
}

for (const file of ['package.json', 'mek.js', 'client.js', 'office.js', 'cordis.patch.yml']) assertPackedFile(file)
const { name, version } = JSON.parse(readArchive('package.json'))
if (name !== 'dsh-mek-bot' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('Expected a versioned dsh-mek-bot release archive.')
}
const tag = `mek-v${version}`
if (gitText(['tag', '--list', tag])) throw new Error(`Tag ${tag} already exists.`)

const dependency = 'node_modules/dsh-mek-bot-timeline'
const prefix = `package/${dependency}/`
const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', maxBuffer }).split('\n')
  .filter(path => path.startsWith(prefix) && !path.endsWith('/'))
  .map(path => path.slice(prefix.length))
for (const required of ['package.json', 'host.js', 'client.js']) {
  if (!files.includes(required)) throw new Error(`The archive is missing ${dependency}/${required}. Run npm ci before packing.`)
}
const bundled = JSON.parse(readArchive(`${dependency}/package.json`))
if (bundled.name !== 'dsh-mek-bot-timeline' || bundled.version !== version) {
  throw new Error(`Expected dsh-mek-bot-timeline ${version} in the release archive.`)
}
if (gitText(['ls-tree', source, dependency])) throw new Error('Pass the source commit used to build the archive.')
const entries = files.map(file => {
  if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(file) || file.split('/').some(part => part === '.' || part === '..')) {
    throw new Error(`Invalid bundled Timeline path: ${file}`)
  }
  const sourcePath = `timeline/${file}`
  assertPackedFile(`${dependency}/${file}`, sourcePath)
  const blob = gitText(['rev-parse', `${source}:${sourcePath}`])
  return `100644 ${blob}\t${dependency}/${file}\n`
})

const temp = mkdtempSync(join(tmpdir(), 'mek-bot-release-'))
try {
  const env = { ...process.env, GIT_INDEX_FILE: join(temp, 'index') }
  git(['read-tree', source], { env })
  git(['update-index', '--index-info'], { env, input: entries.join('') })
  const tree = gitText(['write-tree'], { env })
  const commit = gitText(['commit-tree', tree, '-p', source, '-m', `Package MEK Bot ${version} for GitHub installation`])
  // GitHub serves the tag's raw Git archive. pnpm retains regular bundled files from that archive.
  git(['tag', '-a', tag, commit, '-m', `dsh-mek-bot ${version} stable`])
  console.log(`${tag} ${commit}\nSource ${source}\ngithub:MakeEpoch/dsh-mek-bot#${tag}`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}
