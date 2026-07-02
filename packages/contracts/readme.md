📜 contracts
================================

- single source of truth for `commands`, `events`, `topics`, and `envelope` shapes
- every service imports its message definitions from here, no service defines its own
- validation is shape + field level, runs on both produce and consume sides


### deps:
- `garage/util` via root workspace


### exports
- src/commands.js
    - `commandDefinitions`
    - `commandTopics`
    - `commandTypes`
    - `commandTree`
    - `commandKey`
    - `commandTopic`
    - `validateCommand`
- src/events.js
    - `eventDefinitions`
    - `eventTopics`
    - `eventTypes`
    - `eventTree`
    - `eventKey`
    - `eventTopic`
    - `validateEvent`
- src/envelope.js
    - `createCommandEnvelope`
    - `createEventEnvelope`

- src/schemas.js
    - `Schema` class
    - `Cmd` class

- `src/field.js`    - field validators,
    - `freeze` (defs + vals pair),
    - `freezer` (deep null-proto freeze)

------------------------------------------------

### trees - dot.notation access to slugs
```js
import {
    eventTree,
    commandTree,
} from '@theseus/contracts'

eventTree.wallet.debited            // 'wallet.debited.v1'
commandTree.ship.travel.requested   // 'ship.travel.requested.v1'
```

### topics

- `commands.player`
    - `commands.wallet`
    - `commands.ship`
    - `commands.cargo`
    - `commands.market`
- `events.player`
    - `events.wallet`
    - `events.ship`
    - `events.cargo`
    - `events.market`
    - `events.all`

### envelope
- command:
    ```js
    {
        cmd
        command_type
        correlation_id
        requested_by
        requested
        payload
    }
    ```
- event:
    ```js
    {
        eid,
        event_type,
        aggregate_type,
        aggregate_id,
        aggregate_version,
        occurred,
        causation_id,
        correlation_id,
        producer,
        payload
    }
    ```
