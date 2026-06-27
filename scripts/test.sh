#!/usr/bin/env bash

if   [[ "$1" == "int"* ]]; then SPECS=test/*.integration.spec.js # starts with `int`
elif [[ -n "$1" ]];        then SPECS=test/*.$1.spec.js          # not empty
else                            SPECS=test/*.spec.js             # all
fi

echo $SPECS

node                             \
    --env-file=./.env            \
    --experimental-test-coverage \
    --test-coverage-lines=80     \
    --test-coverage-branches=80  \
    --test-coverage-functions=80 \
    --test $SPECS

