#!/usr/bin/env node

import * as fs from 'node:fs/promises'

const ignore = new Set([
    '.git',
    '.DS_Store',
    'node_modules',
])

await walk(process.cwd(), '')

async function walk(dir, prfx) {
    const [ dirs, files ] = await where(dir)

    dir += '/'

    for (let tail, last, i = dirs.length; i--;) {

        [ tail, last ] = i || files.length
            ? [ '├─┬ ', '│ ' ]
            : [ '└─┬ ', '  ' ]

        console.log(prfx + tail + dirs[ i ])

        await walk(dir + dirs[ i ], prfx + last)
    }

    logFiles(files, prfx)
}

async function logFiles(files, prfx) {
    for (let tail, i = files.length; i--;) {
        tail = i
            ? '├── '
            : '└── '
        console.log(prfx + tail + files[ i ])
        i || console.log(prfx)
    }
}

async function where(dir) {
    const rs = [[], []]
    const add = (i, x) =>
        rs[ i ][ x.startsWith('.')
            ? 'unshift'
            : 'push' ](x)

    for await (const d of await fs.opendir(dir)) {
        /**/ if (ignore.has(d.name)) continue
        else if (d.isDirectory()) add(0, d.name)
        else if (d.isFile())      add(1, d.name)
    }
    return rs
}
