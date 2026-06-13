#!/usr/bin/env bash

node                             \
    --env-file=./.env            \
    --experimental-test-coverage \
    --test-coverage-lines=80     \
    --test-coverage-branches=80  \
    --test-coverage-functions=80 \
    --test                       \
    ./test/*.spec.js
