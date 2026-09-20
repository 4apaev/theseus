phase 4
================


## 4.1 protobuf!
## 4.2 research protobuf transport
## 4.3 google / apple login for easy onboarding
## 4.4 admin board ui

- add/config system nodes
- add/config goods nodes
- debug options - tweak TIME_SCALE, STARTER_CREDITS, INTEREST_RATE

## 4.5 client rewrite

- frontend lib [lit](https://github.com/lit/lit/) + [jade](https://github.com/pugjs/pug/tree/master) style
- client rewrite
- the stickable/draggable/resizable panel layout
- 3d eve style
- 2d isometric (pixel art kawaii) [pixel art pack](https://kipperfalcon.itch.io/2d-isometric-pixel-space-pack)

## 4.6 add fun


- port operation animations
- random encaunters

### exploration

- npc missions
- space reaserch exploration


## 4.7 player

- p2p trading
- public trade feed
- player factions
- ? transponder switch


## 4.8 physics

- full hull catalogue, ship classes and buying ships
- orbital mechanics
- interactive system maps
- KSP style piloting


## 4.9 more economy

- planets / station produce gdp
- multi good station
- non-good services repair / security / tech / workforce / ...
- station types beyond visibility labs / military / prison / gov / agriculture / ...


## 4.10 tech debt
- dockerized deploy
- `using`/`Symbol.dispose` for db client acquisition, `packages/db/src/query.js`'s
  `withClient` - deferred from phase 3 step 3.2, see [tech.debt.md](tech.debt.md)
