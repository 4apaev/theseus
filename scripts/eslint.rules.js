

export default {
    'no-cond-assign'        :   0,
    'class-methods-use-this':   0,
    'max-statements'        : [ 0, 10 ],
    'max-lines'             : [ 0, { max: 256, skipComments: true }],
    'max-lines-per-function': [ 0, {
        max           :  64,
        IIFEs         : !0,
        skipComments  : !0,
        skipBlankLines: !0,
    }],

    'max-len': [ 0, 128, 2, {
        ignoreUrls            : !0,
        ignoreComments        : !0,
        ignoreRegExpLiterals  : !0,
        ignoreTemplateLiterals: !1,
        ignoreStrings         : !1,
    }],

    'comma-spacing'  :    [ 0, { after: true, before: false }],
    'no-multi-spaces':    [ 0, {
        ignoreEOLComments: !0,
        exceptions: {
            BinaryExpression : !0,
            ImportDeclaration: !0,
        }
    }],

    'no-unused-vars'        : [ 0, {
        args             : 'after-used',
        caughtErrors     : 'none',
        argsIgnorePattern: '^-',
        varsIgnorePattern: '^-'
    }],
    'max-depth'                      : [ 2, 4 ],
    'max-params'                     : [ 2, 4 ],
    'no-var'                         :   2,
    'no-lonely-if'                   :   2,
    'no-else-return'                 :   2,
    'no-return-await'                :   2,
    'no-extra-label'                 :   2,
    'no-extra-bind'                  :   2,
    'no-useless-call'                :   2,
    'no-useless-catch'               :   2,
    'no-useless-concat'              :   2,
    'no-useless-constructor'         :   2,
    'no-unused-private-class-members':   2,
    'no-useless-computed-key'        :   2,
    'no-unneeded-ternary'            :   2,
    'no-unreachable-loop'            :   2,
    'no-useless-rename'              :   2,
    'no-undef'                       :   2,
    'no-empty'                       : [ 2, { allowEmptyCatch          : !0   }],
    'no-extra-boolean-cast'          : [ 2, { enforceForLogicalOperands: !0   }],
    'no-multiple-empty-lines'        : [ 2, { max: 1, maxEOF: 0, maxBOF:  0   }],

    'block-scoped-var'               :   2,
    'func-name-matching'             :   2,
    'comma-dangle'                   : [ 2, 'always-multiline'  ],
    'multiline-ternary'              : [ 2, 'always-multiline'  ],
    'eol-last'                       : [ 2, 'always'            ],

    'one-var'                        : [ 2,               { uninitialized            : 'always' }],
    'object-shorthand'               : [ 2, 'always',     { avoidExplicitReturnArrows: !0       }],
    'lines-between-class-members'    : [ 2, 'always',     { exceptAfterSingleLine    : !0       }],
    'brace-style'                    : [ 2, 'stroustrup', { allowSingleLine          : !0       }],

    'comma-style'                    : [ 2, 'last'      ],
    'arrow-body-style'               : [ 2, 'as-needed' ],
    'quote-props'                    : [ 2, 'as-needed' ],
    'arrow-parens'                   : [ 2, 'as-needed' ],
    'new-parens'                     : [ 2, 'never'     ],
    'semi'                           : [ 2, 'never'     ],
    'curly'                          : [ 2, 'multi-or-nest', 'consistent' ],
    'quotes'                         : [ 2, 'single', { allowTemplateLiterals: !0            }],
    'camelcase'                      : [ 2, { properties         : 'never'                   }],
    'space-infix-ops'                : [ 2, { int32Hint          : !0                        }],
    'getter-return'                  : [ 2, { allowImplicit      : !0                        }],
    'require-atomic-updates'         : [ 2, { allowProperties    : !0                        }],
    'prefer-arrow-callback'          : [ 2, { allowNamedFunctions: !0,  allowUnboundThis: !0 }],
    'sort-imports'                   : [ 2, {
        ignoreCase           : !1,
        ignoreMemberSort     : !0,
        allowSeparatedGroups : !0,
        ignoreDeclarationSort: !0,
        memberSyntaxSortOrder: [ 'none', 'single', 'all', 'multiple' ],
    }],

    'indent': [ 2, 4, {
        StaticBlock             : { body : 1 },
        FunctionExpression      : { body : 1, parameters: 2 },
        FunctionDeclaration     : { body : 1, parameters: 2 },
        VariableDeclarator      : { const: 2, var: 2, let: 1 },
        CallExpression          : { arguments: 1 },
        offsetTernaryExpressions: !1,
        flatTernaryExpressions  : !0,
        ArrayExpression         :  1,
        ObjectExpression        :  1,
        MemberExpression        :  1,
        ImportDeclaration       :  1,
        outerIIFEBody           :  1,
        SwitchCase              :  1,
    }],

    'space-in-parens'       :   2,
    'block-spacing'         :   2,
    'func-call-spacing'     :   2,
    'generator-star-spacing': [ 2, {
        after : !0,
        before: !0,
        method: {
            after : !0,
            before: !0,
        },
    }],
    'keyword-spacing': [ 2, {
        after : !0,
        before: !0,
        overrides: {
            return: { after: !0 },
            throw : { after: !0 },
            case  : { after: !0 },
        }
    }],
    'template-curly-spacing'     : [ 2, 'always' ],
    'computed-property-spacing'  : [ 2, 'always', { enforceForClassMembers                 : !0 }],
    'object-curly-spacing'       : [ 2, 'always', { arraysInObjects  : !1, objectsInObjects: !1 }],
    'array-bracket-spacing'      : [ 2, 'always', { arraysInArrays   : !1, objectsInArrays : !1 }],
    'space-before-function-paren': [ 2, { named: 'never', anonymous  : 'always', asyncArrow: 'always' }],

    // ---------------------------------------------------------------------------------------------------------
    'key-spacing'                : [ 0, { align: 'colon', afterColon : !0, beforeColon     : !1 }],
}

