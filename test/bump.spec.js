import test    from 'node:test'
import assert  from 'node:assert/strict'
import Fs      from 'node:fs'
import Os      from 'node:os'
import Pt      from 'node:path'
import { execFileSync } from 'node:child_process'

import '#testing/index.js?title=🧪 🏷️  BUMP'

import bump from '../scripts/bump.js'

/*
    bump() mutates real git + real files - test it against a disposable
    scratch repo, not the real theseus checkout, same shape as
    reset-test-db.js / rebuild.js: real tooling, throwaway environment.
*/

const ROOT = `{
        "name"       : "fixture",
    "version"    : "1.2.3",
    "description": "root fixture"
}`
const PKG  = name => `{
    "name"   : "${ name }",
    "version": "1.2.3",
    "type"   : "module"
}`

function initRepo() {
    const cwd = process.cwd()
    const dir = Fs.mkdtempSync(Pt.join(Os.tmpdir(), 'bump-'))
    process.chdir(dir)

    git('init', '-q')
    git('config', 'user.email', 'test@test')
    git('config', 'user.name', 'test')

    Fs.mkdirSync('apps/foo', { recursive: true })
    Fs.mkdirSync('packages/bar', { recursive: true })
    Fs.writeFileSync('apps/.DS_Store', '')    // stray file, not a workspace dir
    Fs.writeFileSync('package.json', ROOT)
    Fs.writeFileSync('apps/foo/package.json', PKG('@fixture/foo'))
    Fs.writeFileSync('packages/bar/package.json', PKG('@fixture/bar'))

    git('add', '-A')
    git('commit', '-q', '-m', 'initial')

    return {
        dir,
        restore() {
            process.chdir(cwd)
            Fs.rmSync(dir, { recursive: true, force: true })
        },
    }
}

function git(...a) { return execFileSync('git', a, { encoding: 'utf8' }) }

// ── happy path ───────────────────────────────────────────────────────────────

test('bump patches every workspace, preserves formatting, commits + tags', () => {
    const repo = initRepo()
    try {
        const before = {
            root: Fs.readFileSync('package.json', 'utf8'),
            foo : Fs.readFileSync('apps/foo/package.json', 'utf8'),
            bar : Fs.readFileSync('packages/bar/package.json', 'utf8'),
        }

        const tag = bump('patch')
        assert.equal(tag, 'v1.2.4')

        const after = {
            root: Fs.readFileSync('package.json', 'utf8'),
            foo : Fs.readFileSync('apps/foo/package.json', 'utf8'),
            bar : Fs.readFileSync('packages/bar/package.json', 'utf8'),
        }

        for (const key of [ 'root', 'foo', 'bar' ]) {
            const b = before[ key ].split('\n')
            const a = after[ key ].split('\n')
            const diff = a.filter((line, i) => line !== b[ i ])

            assert.equal(diff.length, 1, `${ key }: only the version line should change`)
            assert.match(diff[ 0 ], /"version"\s*:\s*"1\.2\.4"/)
        }

        const log = git('log', '--oneline', '-2')
        assert.equal(log.trim().split('\n').length, 2, 'one new commit on top of initial')
        assert.match(log, /chore: bump to v1\.2\.4/)

        assert.equal(git('cat-file', '-t', 'v1.2.4').trim(), 'tag', 'annotated tag, not lightweight')
        assert.equal(git('rev-list', '-n1', 'v1.2.4').trim(), git('rev-parse', 'HEAD').trim())
    }
    finally { repo.restore() }
})

// ── guard ────────────────────────────────────────────────────────────────────

test('bump refuses when a version file is already dirty', () => {
    const repo = initRepo()
    try {
        Fs.writeFileSync('apps/foo/package.json', PKG('@fixture/foo-renamed'))

        const before = git('rev-parse', 'HEAD').trim()
        assert.throws(() => bump('patch'), /bump refused/)
        assert.equal(git('rev-parse', 'HEAD').trim(), before, 'no commit made')
        assert.equal(git('tag', '-l').trim(), '', 'no tag made')
    }
    finally { repo.restore() }
})
