import { execFileSync }            from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

import { isMain } from '@theseus/config'
import { Fail }    from '@theseus/util'

// bump root + every workspace to the same version, one commit, one tag -
// theseus isn't published and every internal @theseus/* dep is "*", so
// there's no cross-package range to keep in sync, just one version number
export function bump(kind = 'patch') {
    const files = versionFiles()
    assertClean(files)

    execFileSync('npm', [
        'version', kind,
        '--workspaces', '--include-workspace-root',
        '--no-git-tag-version',
    ], { stdio: 'inherit' })

    const tag = `v${ readVersion() }`

    execFileSync('git', [ 'add', ...files ])
    execFileSync('git', [ 'commit', '-m', `chore: bump to ${ tag }` ])
    execFileSync('git', [ 'tag', '-a', tag, '-m', tag ])

    console.log(`bumped to ${ tag }`)
    return tag
}

function versionFiles() {
    return [
        'package.json',
        ...[ 'apps', 'packages' ].flatMap(dir => readdirSync(dir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => `${ dir }/${ d.name }/package.json`)),
    ]
}

function assertClean(files) {
    const dirty = execFileSync('git', [ 'status', '--porcelain', '--', ...files ], { encoding: 'utf8' })
    dirty.trim() && Fail.raise(`refusing to bump - uncommitted changes in:\n${ dirty }`)
}

function readVersion() {
    return JSON.parse(readFileSync('package.json', 'utf8')).version
}

isMain(import.meta.url) && bump(process.argv[ 2 ])
