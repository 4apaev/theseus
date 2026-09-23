import { SystemSeed } from './model.js'

/** the map. sysid → system */
export declare const systems: Readonly<Record<string, SystemSeed>>

/** the star links, gateway to gateway: [ from, to, light years ] */
export declare const stars: readonly [ string, string, number ][]
