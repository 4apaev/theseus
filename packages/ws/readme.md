🔌 ws
================================

- a minimal rfc 6455 server - handshake, frame codec, keepalive
- knows nothing about the app on top of it: `authenticate(rq)` returns
  whatever per-connection metadata the caller wants (or nothing, for an
  open server), `each()` hands it back so the caller decides who gets
  what message. push-only - inbound text frames are ignored.
- extracted from `apps/gateway` (the game's jwt/pid-filtered event feed
  is `apps/gateway/src/feed.js`, built on top of this)

### deps:
- `@theseus/util` - `formatTime` for the `ping` interval

### exports
- `src/frame.js` - the protocol, pure, no sockets
    - `MAGIC`, `OP` - the rfc's handshake guid and frame opcodes
    - `acceptKey(key)` → `Sec-WebSocket-Accept` value for a client key
    - `encodeFrame(payload, opt?)` → one wire frame, `opt.mask = true` to act as a client
    - `createFrameParser(onFrame)` → `{ push(chunk) }`, accumulates tcp
      chunks and emits complete frames
- `src/server.js`
    - `createWss({ authenticate?, ping? })` → `{ handleUpgrade, send, each, stats, close }`
        - `handleUpgrade(rq, socket)` - wire to `server.on('upgrade')`
        - `send(socket, frame)` - guarded raw write of an already-encoded frame
        - `each(fn)` - iterate live connections as `fn(meta, socket)`
        - `authenticate` throwing (sync or async) → plain `401` before the 101
        - unanswered ping for a full `ping` interval → socket dropped

### example

```js
import Http from 'node:http'
import { createWss, encodeFrame } from '@theseus/ws'

const wss = createWss({
    authenticate: rq => verifySomeToken(rq.url),
    ping: '30s',
})

const server = Http.createServer(app)
server.on('upgrade', wss.handleUpgrade)

// broadcast
const frame = encodeFrame(JSON.stringify({ hello: 'world' }))
wss.each((meta, socket) => wss.send(socket, frame))
```
