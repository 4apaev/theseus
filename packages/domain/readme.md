🧮 domain
================================


- pure domain math + game data - no io, no deps on other theseus packages
- interstellar trade formulas from Krugman's [the theory of interstellar trade](../../docs/The.Theory.of.Interstellar.Trade.md)


### deps:
- none (uses `garage/util` via the root workspace)


### exports
- `src/trade.js`
    - `commonFrameYears(distanceLy, velocityC)` - `distance / velocity`
    - `shipFrameYears(distanceLy, velocityC)`   - relativistic proper time, `years * sqrt(1 - v²)`
    - `gameSeconds(commonYears, secondsPerYear)` - game clock conversion
    - `capitalCost(principal, interestRate, commonYears)` - compound interest over travel time
- `src/universe.js`
    - `Universe` - graph: `nodes` (stations) + `edges` (undirected adjacency)
        - `node(stid, meta)` / `link(a, b, ly)` / `has` / `neighbors` / `distance`
        - `path()` (dijkstra) deferred until the map outgrows direct edges
    - `universe`    - the known universe singleton, 3 stations, 3 routes
    - `goods`       - `{ gid: { name, price_base, elasticity } }` - ore / grain / spice
    - `starterShip` - `far treasure`, docked `sol.outpost`, 0.6c, capacity 20
- `src/economy.js` - supply & demand, no state prices here
    - `price(base, stock, target, elasticity)` - scarcity ↑, glut ↓
    - `spread(price, margin)` → `{ price_buy, price_sell }` - station ask above bid

------------------------------------------------

### the known universe

```
              4.3 ly
  sol.outpost ────── alpha.exchange
      │ ore ↑           │ grain ↑
      │ grain ↓         │ spice ↓
      │                 │
      │ 6.0 ly          │ 5.9 ly

      └───── barnards.port ────┘
              spice ↑  ore ↓
```

produce/consume triangle - every station exports one good cheap (`↑ produces`)
and craves another (`↓ consumes`), so profitable routes exist in every direction.
whether a run profits after `capitalCost` of travel time - that's the game.


TODO
----------------
- **`Universe.path()`** - dijkstra multi-hop routing, when the map outgrows the fully-connected triangle.