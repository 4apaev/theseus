#!/usr/bin/env bash

shopt -s extglob

if   [[ "$1" == "int"* ]]; then SPECS=test/*.int*.spec.js       # integrations, starts with `.int`
elif [[ -n "$1" ]];        then SPECS=test/*.$1.spec.js         # not empty, other tags
else                            SPECS=test/!(*.int*).spec.js    # all except integration, ignore starts with `.int`
fi

echo $SPECS

node                             \
    --env-file=./.env            \
    --experimental-test-coverage \
    --test-coverage-lines=80     \
    --test-coverage-branches=80  \
    --test-coverage-functions=80 \
    --test $SPECS

