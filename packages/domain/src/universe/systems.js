// @ts-check

/*
    the map. this is the only file that content touches.

    star distances are real, in light years, from the HYG catalogue
    (docs/hygdata_v42.csv). an orbit radius is the standard NASA mean,
    in AU. the true distance moves with the planets, so a radius is an
    approximation, and a good one.

    a station carries its radius and nothing else about position. every
    in-system distance is the gap between 2 radii, and index.js does
    that arithmetic - see `lightYears(Math.abs(a.au - b.au))`.

    **the topology stays explicit.** which stations link is a design
    choice, not a consequence of the radii: Venus links to Mars but not
    to the Outpost, though the Outpost is its nearer neighbour. only the
    distance derives.

    a gateway holds the links to the other stars. a system with one
    station is a bare gateway, and it takes the Outpost's own notional
    1.0 AU. a system with more is an inner well.
*/

/** @type { Record<string, import('../../types/universe/model.js').SystemSeed> } */
export const systems = {
    sol: {
        name: 'Sol', star: 'G2V yellow dwarf', gateway: 'sol.outpost',

        orbits: {
            'sol.mercury' : { name: 'Mercury Deep',   au: 0.387, produces: { ore  : 10 }, consumes: { grain: 6 }},
            'sol.venus'   : { name: 'Venus Lab',      au: 0.723, produces: { spice:  6 }, consumes: { ore  : 4 }},
            'sol.outpost' : { name: 'Sol Outpost',    au: 1.000, produces: { ore  :  8 }, consumes: { grain: 5 }, stocks: [ 'reactor.mk1', 'cruise.mk1', 'maneuver.mk1', 'cargo.mk1' ]},
            'sol.mars'    : { name: 'Mars Hub',       au: 1.524, produces: { grain:  7 }, consumes: { spice: 5 }},
            'sol.ganymede': { name: 'Ganymede Yards', au: 5.203, produces: { ore  :  6 }, consumes: { spice: 4 }, stocks: [ 'reactor.mk2', 'cruise.mk2', 'maneuver.mk2', 'cargo.mk2' ]},
            'sol.titan'   : { name: 'Titan Ring',     au: 9.537, produces: { spice:  7 }, consumes: { grain: 5 }},
        },

        links: [
            [ 'sol.outpost',  'sol.mercury'  ],
            [ 'sol.mercury',  'sol.venus'    ],
            [ 'sol.venus',    'sol.mars'     ],
            [ 'sol.mars',     'sol.ganymede' ],
            [ 'sol.mars',     'sol.titan'    ],
            [ 'sol.mars',     'sol.outpost'  ],
            [ 'sol.titan',    'sol.outpost'  ],
            [ 'sol.ganymede', 'sol.titan'    ],
        ],
    },

    'alpha.centauri': {
        name: 'Alpha Centauri', star: 'G2V + K1V binary', gateway: 'alpha.exchange',
        orbits: {
            'alpha.exchange': { name: 'Alpha Exchange', au: 1.0, produces: { grain: 8 }, consumes: { spice: 5 }},
        },
    },

    'barnards.star': {
        name: 'Barnards Star', star: 'M4V red dwarf', gateway: 'barnards.port',
        orbits: {
            'barnards.port': { name: 'Barnards Port', au: 1.0, produces: { spice: 8 }, consumes: { ore: 5 }},
        },
    },

    'wolf.359': {
        name: 'Wolf 359', star: 'M6V red dwarf', gateway: 'wolf.reach',
        orbits: {
            'wolf.reach': { name: 'Wolf Reach', au: 1.0, produces: { grain: 9 }, consumes: { ore: 6 }},
        },
    },

    sirius: {
        name: 'Sirius', star: 'A1V + white dwarf', gateway: 'sirius.gate',
        orbits: {
            'sirius.gate': { name: 'Sirius Gate', au: 1.0, produces: { ore: 9 }, consumes: { spice: 6 }, stocks: [ 'ansible.mk1' ]},
        },
    },
}

/*
    the star links, in light years, gateway to gateway.

    alpha.exchange stands for Rigil Kentaurus, the G2V star of the Alpha
    Centauri pair - the type closest to Sol's own.

    no gateway reaches every other gateway. Sol does not touch Wolf 359
    or Sirius, so a player flies through Alpha Centauri or through
    Barnards Star. that is a design choice and not a fact about the
    stars: Sol really sits 7.80 ly from Wolf 359, and 8.60 ly from
    Sirius, both in a straight line.
*/
/** @type { [ string, string, number ][] } */
export const stars = [
    [ 'sol.outpost',    'alpha.exchange',  4.32 ],
    [ 'sol.outpost',    'barnards.port',   5.95 ],
    [ 'alpha.exchange', 'barnards.port',   6.44 ],
    [ 'barnards.port',  'wolf.reach',     10.93 ],
    [ 'alpha.exchange', 'sirius.gate',     9.52 ],
    [ 'alpha.exchange', 'wolf.reach',      8.27 ],
    [ 'wolf.reach',     'sirius.gate',     9.02 ],
]
