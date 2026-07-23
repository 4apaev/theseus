import gb               from 'globals'
import js               from '@eslint/js'
import { defineConfig } from 'eslint/config'

import rules from './scripts/eslint.rules.js'

export default defineConfig([
    {
        ignores: [
            'node_modules/**',
            './scripts/eslint.rules.js',
        ],
    },
    {
        rules,
        plugins: { js },
        extends: [ 'js/recommended' ],
        files  : [
            'apps/**/*.js',
            'packages/**/*.js',
            'scripts/**/*.js',
            'test/**/*.js',
        ],
        languageOptions: {
            globals: gb.node
        },
    },
    {
        rules,
        plugins: { js },
        extends: [ 'js/recommended' ],
        files  : [
            'client/**/*.js',
        ],
        languageOptions: {
            globals: gb.browser
        },
    },
])
