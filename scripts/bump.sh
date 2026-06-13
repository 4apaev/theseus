#!/usr/bin/env bash

vr="${1:-patch}"

npm version $vr --no-git-tag-version

# npm version | major
#             | minor
#             | patch
#             | premajor
#             | preminor
#             | prepatch
#             | prerelease
#             | from-git
# options:
#     --json
#     --sign-git-tag
#     --allow-same-version
#     --no-commit-hooks
#     --no-git-tag-version
#     --preid prerelease-id