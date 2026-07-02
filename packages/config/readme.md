🎛️ config
================================

- env access + service boot helpers
- `process.loadEnvFile()` runs at import - `.env` is loaded once, first import wins


### deps:
- `garage/util` via root workspace


### exports
- `src/env.js`     - `readEnv(key, fallback)`, `requireEnv(key)` - coerces `'true'`/`'false'`/numbers, empty string → fallback
- `src/service.js` - `bootService(description)` structured boot log, `isMain(import.meta.url)` entrypoint check

--------------------------------

### gotchas
- `format('')` → `undefined` → fallback applies. any other string is truthy and wins
- the pre-push hook writes `KEY=` empty values into `.env.example` for this reason
