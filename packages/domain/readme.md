🧮 domain
================================


- pure domain math - no io, no deps on other theseus packages
- interstellar trade formulas from Krugman's [the theory of interstellar trade](../../docs/The.Theory.of.Interstellar.Trade.md)


### deps:
- none (uses `garage/util` via the root workspace)


### exports
- `src/ids.js`   - `makeId(prefix)` → `prefix_<uuid>`
- `src/trade.js`
    - `commonFrameYears(distanceLy, velocityC)` - `distance / velocity`
    - `shipFrameYears(distanceLy, velocityC)`   - relativistic proper time, `years * sqrt(1 - v²)`
    - `gameSeconds(commonYears, secondsPerYear)` - game clock conversion
    - `capitalCost(principal, interestRate, commonYears)` - compound interest over travel time
