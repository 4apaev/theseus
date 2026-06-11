infra
=====

local infrastructure for phase 1.

services:

- kafka: `localhost:9092`
- postgres: `localhost:5432`
- kafka ui: `http://localhost:8080`

commands:

```text
npm run infra:up
npm run infra:health
npm run infra:ps
npm run infra:logs
npm run infra:down
```
