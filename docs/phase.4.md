phase 4
================


client rewrite
----------------


- frontend lib [lit](https://github.com/lit/lit/) + [jade](https://github.com/pugjs/pug/tree/master) style
- client rewrite
- the stickable/draggable/resizable panel layout

### re design (decision needed)

1. 3d eve style
2. 2d isometric (old starcraft) [pixel art pack](https://kipperfalcon.itch.io/2d-isometric-pixel-space-pack)


add fun
----------------

- port operation animations
- random encaunters

### exploration

- npc missions
- space reaserch exploration


player
----------------

- p2p trading
- public trade feed
- player factions
- ? transponder switch


physics
----------------

- full hull catalogue, ship classes and buying ships
- orbital mechanics
- interactive system maps
- KSP style piloting


more economy
----------------

- planets / station produce gdp
- multi good station
- non-good services repair / security / tech / workforce / ...
- station types beyond visibility labs / military / prison / gov / agriculture / ...


tech debt
----------------
- dockerized deploy
- `using`/`Symbol.dispose` for db client acquisition, `packages/db/src/query.js`'s
  `withClient` - deferred from phase 3 step 3.2, see [tech.debt.md](tech.debt.md)
