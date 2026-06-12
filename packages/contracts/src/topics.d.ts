export declare const commandTopics: Readonly<{
    cargo: 'commands.cargo'
    market: 'commands.market'
    player: 'commands.player'
    ship: 'commands.ship'
    wallet: 'commands.wallet'
}>

export declare const eventTopics: Readonly<{
    all: 'events.all'
    cargo: 'events.cargo'
    market: 'events.market'
    player: 'events.player'
    ship: 'events.ship'
    wallet: 'events.wallet'
}>

export type CommandTopic = typeof commandTopics[keyof typeof commandTopics]
export type EventTopic = typeof eventTopics[keyof typeof eventTopics]
