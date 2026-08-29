export {
    capitalCost,
    commonFrameYears,
    gameSeconds,
    shipFrameYears,
} from './trade.js'

export {
    Universe,
    default as universe,
    goods,
    starterShip,
    universeData,
    currency,
    TIME_SCALE,
    INTEREST_RATE,
    STARTER_CREDITS,
    type Good,
    type Edge,
    type Route,
    type Station,
    type System,
    type StationMeta,
    type UniverseJSON,
} from './universe.js'

export {
    price,
    spread,
} from './economy.js'

export {
    randomShipName,
} from './shipNames.js'

export {
    Fitting,
    fitting,
    hulls,
    modules,
    starterLoadout,
    slotFamilies,
    mounts,
    previewLoadout,
    deriveStats,
    cargoLoad,
    type Hull,
    type Slot,
    type Requirement,
    type Effect,
    type Design as ModuleDesign,
    type Stats,
    type Operation,
    type LoadoutContext,
    type LoadoutPreview,
    type CargoLine,
} from './modules.js'
