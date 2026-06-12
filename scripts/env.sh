#!/usr/bin/env bash

# sed 's/#[^@].*//g;s/=.*/=🦄/g;/^[[:space:]]*$/d' $PWD/.env > $PWD/.env.example

sed                     \
    -e 's/#.*//g'        \
    -e 's/=.*/=🦄/g'      \
    -e '/^[[:space:]]*$/d' \
    $PWD/.env > $PWD/.env.example






