#!/usr/bin/env bash

shopt -s extglob

# integration specs share the market schema - run files one at a time
CONCURRENCY=""
COVERAGE=${2:-"90"}

if [[ "$1" == "int"* ]]; then
    SPECS="test/*.int*.spec.js"
    COVERAGE=50
    CONCURRENCY="--test-concurrency=1"
elif [[ -n "$1" ]]; then
    SPECS="test/*.$1.spec.js"
else
    SPECS="test/!(*.int*).spec.js"
fi

echo "SPECS    : $SPECS"
echo "COVERAGE : $COVERAGE"

node                             \
    --env-file=./.env            \
    --experimental-test-coverage \
    --test-coverage-exclude='packages/testing/**'  \
    --test-coverage-lines=$COVERAGE     \
    --test-coverage-branches=$COVERAGE  \
    --test-coverage-functions=$COVERAGE \
    $CONCURRENCY \
    --test $SPECS

