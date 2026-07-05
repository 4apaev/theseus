The Theory of Interstellar Trade - summary
================================================

> Paul Krugman, July 1978. written at Yale, published in Economic Inquiry (2010).

**this file is a summary, not the text.** the full paper is
[The.Theory.of.Interstellar.Trade.pdf](The.Theory.of.Interstellar.Trade.pdf)
(also on [princeton.edu](https://www.princeton.edu/~pkrugman/interstellar.pdf)).
it is, in Krugman's own words, "a serious analysis of a ridiculous subject,
which is of course the opposite of what is usual in economics."


### the problem

how should interest charges on goods in transit be computed when the goods
travel at close to the speed of light? relativistic time dilation means the
trip takes fewer years by the ship's clock than by the planets' clocks -
so whose clock does the accountant use?


### I. introduction

interplanetary trade raises no new theory - it fits the ordinary
interregional/international trade framework. interstellar trade is different
in kind: transit times are enormous, ships move at relativistic speeds, and
simultaneity stops being unambiguous. the paper's running joke is that this
is a thought experiment done with completely straight-faced formal rigor -
figures include an indecipherable Minkowski spacetime diagram drawn "to
assist the reader," and the acknowledgements thank a committee that does
not exist.


### II. fundamental considerations

the physical setup, deliberately simplified:
- two planets, Earth and Trantor, at rest in the same inertial frame,
  separated by a large distance
- ships travel at constant velocity `v < c`; special relativity only,
  no acceleration phases
- a trip of distance `d` takes `d / v` years measured by planet clocks,
  but `(d / v) · √(1 − v²)` years measured aboard the ship

the economic question follows immediately: goods in transit are capital tied
up for the duration - which duration?


### III. interstellar trade in goods

the core result. an exporter shipping goods to Trantor forgoes the use of
their capital while the cargo is in flight. Krugman shows the relevant
opportunity cost is the one measured in the frame of the trading planets,
because that is the frame in which the alternative investments (bonds on
Earth, bonds on Trantor) accrue interest.

**first fundamental theorem of interstellar trade:** when trade takes place
between two planets in a common inertial frame, interest costs on goods in
transit should be calculated using time measured by clocks in that frame -
not by clocks aboard the ship.

the ship's proper time is economically irrelevant; no market participant's
portfolio compounds on ship time. (the paper notes the traveling merchant
ages less, which is nice for the merchant but does not change the
present-value arithmetic.)

trade happens if the price gap between planets exceeds the interest cost of
the transit - the same condition as terrestrial trade, just with very long
`t` in `(1 + r)^t`.


### IV. interstellar capital movements

if goods arbitrage works, what about pure capital flows? different observers
disagree about simultaneity, so "the interest rate on Trantor now" is not
even well defined from Earth. Krugman resolves it with a no-arbitrage
argument: an investor can always ship goods out, invest abroad, and ship
proceeds back - a round trip that is well defined in the planets' common
frame regardless of anyone's clock.

**second fundamental theorem of interstellar trade:** if sentient beings can
hold assets on both planets, competition (arbitrage) will equalize the
interest rates on the two planets.

both theorems are, as the abstract admits, "useless but true."


### why theseus cares

- `years_abs = d / v` and `years_rel = years_abs · √(1 − v²)` -
  [`@theseus/domain` trade.js](../packages/domain/readme.md) implements both;
  the ui may show ship time as flavor, but all pricing uses `years_abs`
- `capitalCost(principal, rate, years_abs)` - the first theorem in code:
  a trade run only profits if the station price gap beats it
- one `INTEREST_RATE` across stations - the second theorem, taken as given
