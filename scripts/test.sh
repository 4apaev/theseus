#!/usr/bin/env bash

shopt -s extglob

# integration specs share the market schema - run files one at a time
CONCURRENCY=""
GLOBAL_SETUP=""
COVERAGE=${2:-"90"}
COVER="--experimental-test-coverage"

if [[ "$1" == "int"* ]]; then
    SPECS="test/*.int*.spec.js"
    COVERAGE=80
    CONCURRENCY="--test-concurrency=1"
    GLOBAL_SETUP="--test-global-setup=./scripts/reset-test-db.js"
elif [[ -n "$1" ]]; then
    SPECS="test/$1.spec.js"
    COVER=""
else
    SPECS="test/!(*.int*).spec.js"
fi

echo
echo "| SPECS        │ $SPECS"
echo "│ COVERAGE     │ $COVERAGE"
echo "│ CONCURRENCY  │ $CONCURRENCY"
echo "│ GLOBAL_SETUP │ $GLOBAL_SETUP"
echo

node                             \
    --env-file=./.env            \
    --env-file=./.env.dev        \
    $COVER                       \
    --test-coverage-exclude='packages/testing/**'  \
    --test-coverage-exclude='scripts/reset-test-db.js' \
    --test-coverage-lines=$COVERAGE     \
    --test-coverage-branches=$COVERAGE  \
    --test-coverage-functions=$COVERAGE \
    $CONCURRENCY \
    $GLOBAL_SETUP \
    --test $SPECS

