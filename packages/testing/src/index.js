export {
    fixtureIds,
} from './fixtures.js'

export {
    wsConnect,
} from './ws.js'

export {
    createFakeKafka,
} from './fake-kafka.js'

export {
    guid,
    waitFor,
    collectEvents,
    createPublisher,
    wherePayload,
} from './integration.js'

export {
    makeCmd,
    fakePool,
    fakeClient,
    fakeTablePool,
    fakeTableClient,
    fakeTransact,
    outboxEvents,
} from './mocks.js'

const dict = {
    auth      : '🔐  AUTH      🧪 ',
    bump      : '🏷️  BUMP      🧪 ',
    config    : '🎛️  CONFIG    🧪 ',
    contracts : '📜  CONTRACTS 🧪 ',
    db        : '📇  DB        🧪 ',
    domain    : '🧮  DOMAIN    🧪 ',
    gateway   : '⛩️  GATEWAY   🧪 ',
    kafka     : '📬  KAFKA     🧪 ',
    market    : '🎰  MARKET    🧪 ',
    player    : '🎮  PLAYER    🧪 ',
    ship      : '🛸  SHIP      🧪 ',
    skeleton  : '🚀  SKELETON  🧪 ',
    testing   : '🧪  TESTING   🧪 ',
    util      : '🪏  UTIL      🧪 ',

    '/scripts/smoke.js': '🚬  SMOKE 😶‍🌫️ ',

    'game.integration'               : '🚦 🚀 ∫∫ GAME    ',
    'gateway.integration'            : '🚦 ⛩️ ∫∫ GATEWAY ',
    'ship.integration'               : '🚦 🛸 ∫∫ SHIP    ',
    'player.integration'             : '🚦 🎮 ∫∫ PLAYER  ',
    'market.integration'             : '🚦 🎰 ∫∫ MARKET  ',
    'market.rebuild.integration'     : '🚦 🎰 ∫∫ REBUILD MARKET     ',
    'projection.rebuild.integration' : '🚦 📺 ∫∫ REBUILD PROJECTION ',

}

const name = process.argv[ 1 ]
    .replace(process.cwd(), '')
    .replace(/\/test\/([^/]+)\.spec\.js$/i, '$1')
    .toLowerCase()

const title = dict[ name ] ?? `🤔 🤷‍♀️ 🤔 🤷‍♀️ ${ name } 🧪🧪🧪 `

console.log(
    '\n── %s\n',
    title.padEnd(64, '─'),
)
