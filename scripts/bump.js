import fs from 'node:fs'
import pt from 'node:path'
import ch from 'node:child_process'

import { Fail }   from '@theseus/util'
import { isMain } from '@theseus/config'

// bump root + every workspace to the same version, one commit, one tag
export default function bump(kind = 'patch') {
    const files = [
        'package.json',
        ...collect('apps'),
        ...collect('packages'),
    ]

    assertClean(files)

    const v = next(kind)
    files.forEach(f => patch(f, v))

    const tag = 'v' + v

    git('add', ...files)
    git('commit', '-m', `chore: bump to ${ tag }`)
    git('tag', '-a', tag, '-m', tag)

    console.log('bumped to', tag)
    return tag
}

// ─────────────────────────────────────────────────────────────────────────────

function next(kind) {
    // only ask npm to compute the next semver, preserv current format style.
    // prints a bare vX.Y.Z
    const out = npm('version', kind, '--no-git-tag-version')
    git('checkout', '--', 'package.json')
    return out.trim().replace(/^v/, '')
}

function patch(file, version) {
    const src = fs.readFileSync(file, 'utf8')
    fs.writeFileSync(file, src.replace(
        /"version"( *: *)"[^"]*"/,
        `"version"$1"${ version }"`,
    ))
}

function collect(dir) {
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => pt.join(dir, d.name, 'package.json'))
}

function assertClean(files) {
    const dirty = git('status', '--porcelain', '--', ...files)
    dirty.trim() && Fail.raise(`bump refused - uncommitted changes in:\n${ dirty }`)
}

// ─────────────────────────────────────────────────────────────────────────────

function git(...a) { return ch.execFileSync('git', a, { encoding: 'utf8' }) }
function npm(...a) { return ch.execFileSync('npm', a, { encoding: 'utf8' }) }

// ── BOOT ─────────────────────────────────────────────────────────────────────

isMain(import.meta.url) && bump(process.argv[ 2 ])
