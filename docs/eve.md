eve online - architecture reading list
================================================

research spike for the `eve online` item in [game.md](game.md) - sources on
how CCP built a single-shard mmo, picked because they map onto choices
already made here (event sourcing, one pg schema per service, a
supply/demand pricing model).


single-shard architecture
------------------------------------------------

one universe, no server-per-realm split - every player logs into the same
world.

- [EVE Online Architecture - High Scalability](https://highscalability.com/eve-online-architecture/) -
  the widely-cited deep dive, start here
- [GDC Vault - The Server Technology of EVE Online: How to Cope with
  300,000 Players in One World](https://gdcvault.com/play/1030721/The-Server-Technology-of-EVE) -
  the original talk everything else cites
- [Scram Web - Architecture of the EVE Cluster](http://scramweb.blogspot.com/2010/08/architecture-of-eve-cluster.html) -
  shorter, more diagram-driven version of the same picture


node-per-solar-system + the database
------------------------------------------------

~90-100 blades run 2 game-logic nodes each, one node per solar system, hot
systems (Jita) get a dedicated blade - a load-driven partitioning scheme,
worth comparing against our kafka-topic-per-domain split.

- [A History of EVE Database Server Hardware](https://www.eveonline.com/news/view/a-history-of-eve-database-server-hardware) -
  CCP's own dev blog. one giant SQL Server, not sharded - everything
  settles through it, directly comparable to our one-postgres/
  schema-per-service call


concurrency model
------------------------------------------------

lightweight microthreads (tasklets) instead of OS threads - what makes
thousands of concurrent solar-system simulations affordable on one node.

- [Stackless Python in EVE - Kristján Valur Jónsson, CCP](https://www.slideshare.net/Arbow/stackless-python-in-eve)
- [Talk Python To Me - EVE Online: MMO game powered by Python](https://talkpython.fm/episodes/show/52/eve-online-mmo-game-powered-by-python) -
  more casual, good overview if the slide deck's too dense cold


time dilation - handling load spikes without dropping fidelity
------------------------------------------------

instead of dropping commands or lagging, they slow the whole simulation's
clock down (up to 10x) so the command queue never overflows. conceptually
close to our own `TIME_SCALE` constant, just applied dynamically under
load instead of statically for pacing.

- [Introducing Time Dilation (TiDi) - EVE Online](https://www.eveonline.com/news/view/introducing-time-dilation-tidi)
- [EVE University Wiki - Time dilation](https://wiki.eveuniversity.org/Time_dilation) -
  clearer plain-language explanation than the dev blog


the economy - most relevant one to us
------------------------------------------------

CCP hired a real macroeconomist (Dr. Eyjólfur Guðmundsson) in 2007 to
monitor and publish on EVE's player-driven economy - price indices,
inflation/deflation tracking, a virtual GDP equivalent ("GUP"). our
`price(base, stock, target, elasticity)` is a toy version of exactly what
these reports measure at scale.

- [NPR Planet Money - EVE Online's Got A Real Economist](https://www.npr.org/sections/money/2009/08/eve_onlines_got_a_real_economi.html)
- [MMORPG.com - CCP Hires Economist](https://www.mmorpg.com/news/ccp-hires-economist-2000062924)
- [Slashdot - EVE Online's First Quarterly Economics Report Published](https://games.slashdot.org/story/07/11/14/2050259/eve-onlines-first-quarterly-economics-report-published)
