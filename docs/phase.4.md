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


## 4.11 game balance

theseus reads as a simulation, not as a game
([game.md](game.md)'s "game balance"). this step sets the numbers, and
it comes last because every mechanic must exist before anyone tunes it.

**the sim is the instrument.** `player_profit` and `station_profit` in
the report are the same subtraction from both sides, and the rejection
mix says which rule the players fight. see [sim.md](sim.md).

### what the numbers say today

- **the spread is already a 22.2% tax.** `spread(px, 0.1)` sells at
  +10% of spot and buys at -10%. a round trip pays 22.2% before any fee.
  a trade pays only when the destination beats the origin by that much.
- **the price curve clears it easily.** ore at a stock ratio of 1.5
  prices at 1.63x. profitable arbitrage exists.
- **no sim player has ever found it.** the dice buy and sell at the same
  station, so every run ends with the players in the red and the
  stations ahead - station profit +1645 against players at -936. that
  measures the dice, and not the game.

### the order

1. **an agent player that hauls cargo on purpose.** until one exists,
   every balance number gets tuned against a random walk that loses by
   construction. this is the gate for the whole step.
2. **measure the real margin** on a full buy, carry, sell loop.
3. **set the fees to what that margin carries** - see [game.md](game.md)'s
   "fees and taxes". prefer a derived fee over a flat one: docking from
   the orbit radius, handling from cargo volume, sales tax from the
   station's produces and consumes map. all 3 read data that exists.
4. **re-run and compare.** a balance change lands only with a before and
   an after from the same seed and the same tempo.

### what needs a balance pass

- the spread margin, per good or per station, instead of a flat 0.1
- STARTER_CREDITS against the price of the first useful module
- drift rate against travel time - the ratio decides whether a trader
  arrives to a restocked market, see [scripts/readme.md](../scripts/readme.md)
- module prices and the tier gaps
- the gravity well term, which changes every in-system leg at once
  ([game.md](game.md)'s "the gravity well"). Mercury and Venus turn hard
  for a starter ship, and the early game moves outward
- INTEREST_RATE, which no service reads today

### the trap

fees and a gravity well both make the inner system expensive. they are
not the same lever. a fee takes money, and a well asks for a better
drive. **stacking both without measuring turns the map into a wall.**
