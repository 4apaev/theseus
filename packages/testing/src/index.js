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
} from './integration.js'

export {
    makeCmd,
    fakePool,
    fakeClient,
    fakeTransact,
    outboxEvents,
} from './mocks.js'

const title = (
    new URL(import.meta.url, 'file:')
        .searchParams.get('title')
        ?? process.argv[ 1 ]
).replace(process.cwd(), '')

console.log(
    '\n%s\n',
    `── ${ title } `.padEnd(64, '─'),
)
