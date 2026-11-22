import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

test('a release tag ships the real Timeline package files while leaving main on the source commit', t => {
  const scratch = mkdtempSync(join(tmpdir(), 'mek-release-tag-test-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const repo = join(scratch, 'repo')
  const packed = join(scratch, 'packed')
  const archive = join(scratch, 'dsh-mek-bot-1.2.3.tgz')
  const script = join(repo, 'scripts/create-release-tag.mjs')
  const dependency = 'node_modules/dsh-mek-bot-timeline'
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
  const write = (root, path, contents) => {
    const file = join(root, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, contents)
  }
  const pack = () => execFileSync('tar', ['-czf', archive, '-C', packed, 'package'])
  const createTag = () => spawnSync(process.execPath, [script, archive], { cwd: repo, encoding: 'utf8' })

  mkdirSync(dirname(script), { recursive: true })
  copyFileSync(new URL('../scripts/create-release-tag.mjs', import.meta.url), script)
  write(repo, 'package.json', '{"name":"dsh-mek-bot","version":"1.2.3"}\n')
  for (const file of ['mek.js', 'client.js', 'office.js', 'cordis.patch.yml', 'package.json']) {
    if (file !== 'package.json') write(repo, file, `${file}\n`)
    mkdirSync(join(packed, 'package'), { recursive: true })
    copyFileSync(join(repo, file), join(packed, 'package', file))
  }
  for (const [path, value] of Object.entries({
    'package.json': '{"name":"dsh-mek-bot-timeline","version":"1.2.3"}\n',
    'host.js': 'timeline host\n',
    'client.js': 'timeline client\n',
    'locale/en.json': '{}\n',
  })) {
    write(repo, `timeline/${path}`, value)
    write(packed, `package/${dependency}/${path}`, value)
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Release fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'tag.gpgSign', 'false')
  git('add', '.')
  git('commit', '-qm', 'Release source')
  const source = git('rev-parse', 'HEAD')

  write(packed, `package/${dependency}/host.js`, 'stale host\n')
  pack()
  const stale = createTag()
  assert.notEqual(stale.status, 0)
  assert.match(stale.stderr, /Packed file differs from timeline\/host\.js/)
  assert.equal(git('tag', '--list'), '')

  write(packed, `package/${dependency}/host.js`, 'timeline host\n')
  pack()
  const created = createTag()
  assert.equal(created.status, 0, created.stderr)
  assert.match(created.stdout, /github:MakeEpoch\/dsh-mek-bot#mek-v1\.2\.3/)
  assert.equal(git('rev-parse', 'mek-v1.2.3^{}^'), source)
  assert.equal(git('rev-parse', 'HEAD'), source)
  assert.equal(git('status', '--porcelain'), '')
  assert.match(git('ls-tree', 'mek-v1.2.3', `${dependency}/host.js`), /^100644 blob /)
  assert.equal(git('show', `mek-v1.2.3:${dependency}/host.js`), 'timeline host')
  assert.match(createTag().stderr, /Tag mek-v1\.2\.3 already exists/)
})
