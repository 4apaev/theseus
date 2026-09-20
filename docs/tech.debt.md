tech debt
================

### game save

what about a game save?
every player action is saved by default.
rebuild state is present.

let's say player want to save game before some
dangerous maneuver then load game from safe checkpoint.
how does one implement such a thing?


### ship's traits

ship's personal traits / characteristic

slightly randomize ship's traits
velocity, acceleration, etc


debt
----------------

### JSDoc (highest priority)

update types & add jsdoc to everything


### service createHandlers otgrow

it's time to make a class of it.
can be extension of pkg/service
can use couple of helper methods like Outbox.write,
to reduce scaffolds & for general readability.


### player service

better checking mechanism `isAdmin(handle)`


### gateway

#### next api version

`/api` is v0 - the routes as they stand. a breaking change gets
`/api/v1` beside it, and the 2 live together until the client moves.

see [progress](progress.md)'s "gateway routes - /api, resources, real
methods" for the convention the current paths follow.


### db

#### db backups

probably after deploy phase is ready


#### query registry

create global query registry in `@theseus/db`.
add compile phase for caching, and to avoid duplicates.
unify all query styles for consistency.

#### extract `sql` to `queries.js`
unified `reject`. almost any func in service/src/handlers defines own `reject`

affected services:
- market


#### diagrams

- annotated diagrams of tables + comments on every field
- annotated diagrams of system wide layout

### query builder

[knex](https://knexjs.org/guide/query-builder.html#knex)

construct and cache queries
pre compile & use cached queries in run time
add prestart phase when queries compiled

```js

  class Q {
    constructor(...a) {
      this.argv = a
      // proxy to handle chain calls
      return new Proxy(this, {
        has(trg, k, px) { return px },
        get(trg, k, px) { return px },
        set(trg, k, px) { return px },
      })
    }

    key()    ; omit()
    select() ; insert() ; update() ; create()
    into()   ; from()   ; join()   ; using()
    case()   ; when()   ; then()   ; where()
    limit()  ; values() ; order()  ; conflict()
    on()     ; and()    ; as()     ; by()
    do()     ; or()     ; for()    ; set()

    ...

    static types = {
      bol: Symbol('boolean'), num: Symbol('num'), obj : Symbol('jsonb'),
      txt: Symbol('text')   , int: Symbol('int'), date: Symbol('timestamp'),

      pk  : Symbol('primary key'), uniq : Symbol('unique')  ,
      ref : Symbol('references') , nnl : Symbol('not null'),

      get now() { return new Date },
      def(x) { return `default ${ x }` },
    }

    static create(...a) { return Reflect.construct(this, [ 'create', ...a ]) }
    static select(...a) { return Reflect.construct(this, [ 'select', ...a ]) }
    static insert(...a) { return Reflect.construct(this, [ 'insert', ...a ]) }
    static update(...a) { return Reflect.construct(this, [ 'update', ...a ]) }
    ...
  }

  function Q() {
    return new QBuild
  }

  const T = QBuild.types

  Q.create('ships', {
    sid     : [ T.txt, T.pk ],
    pid     : [ T.txt, T.nn, T.uniq ],
    stid    : T.txt,
    status  : [ T.txt, T.nn, T.def('docked') ],
    ansible : [ T.bool, T.nn, T.def(false)    ]
  })

  Q.table('ships')
    .key('sid').txt.pk
    .key('pid').txt.nnl.unq
    .key('stid').txt
    .key('status').txt.nnl.def('docked')
    .key('ansible').bol.nnl.def(false)


  Q.table.ships
    .sid.txt.pk
    .pid.txt.nnl.unq
    .stid.txt
    .status.txt.nnl.def.docked
    .ansible.bol.nnl.def.false

  Q.select('fm.slot', 'fm.gid')
    .from('fitted_modules', 'fm')
    .join('ships' 's')
    .using('sid')
    .where('fm.sid', sid)
    .and('s.pid', pid)
    .order('fm.slot')


  Q.select
    .from('ships')
    .omit('ansible')
    .order
      .desc('departed)
    .where('sid', 'xxxx')
    .and({ pid: 'yyyy' })
```



### infra

<details>
<summary>vscode sql highlight</summary>
</details>


#### db

to avoid conflicts when branch switching,
create dedicated db per branch (on demand, not auto).
in case when branch alters/changes db structure,
create a branch specific dbs.
see `ship-upgrades` vs `ship-modules` branch conflicts

#### deploy

dockerize the game. need a real plan for this.
uptime check is a dev tool, not a production health check,
when this step lands, will be replaced with systemd/container-native
health check

#### logger

introduce logger.
can be part of `packages/service`


#### observability

add monitoring tools.
logs query, grafana, prometheus (or equivalent).
need some research: today de facto standard?, alternatives?, configs & costs?


- #### load tests

see how theseus behaves under load - [sim.md](sim.md)

tasks:

1. give app.js its own client/qa.html

2. create 10-20 players and run a simulation.
  buy, sell, refit modules, send messges, etc.
  full game capabilities.

3. then collect analytics from db and kafka.
  see wich is more common than the others.
  maybe expose a bottleneck or a bug god forbid.



### language/types migration - ts vs go

the project grew past the point where the types gap is comfortable. 3
options were compared, on 2026-08-31. decision: none yet - close the
gap in place first ([phase 3](phase.3.md) step 3.8, jsdoc + `checkJs`),
revisit `ts` after that step lands. `go` is set aside, not planned.

**the actual problem**: not performance, not concurrency, not
deployment. each package's real types live in a hand-written
`types/*.d.ts`, separate from its untyped `.js`. a consumer importing
the package sees full types; editing the `.js` source shows none - the
2 files are never linked, so they can drift and often already do.

#### option 1 - jsdoc + `checkJs`, no syntax change

- put each package's types back into the `.js` file they describe,
  as jsdoc. delete the separate `.d.ts`.
- no build step. `node apps/x/src/main.js` keeps working as-is - jsdoc
  is a comment, node ignores it.
- already dry-run tested for real: `checkJs` on across `apps/` +
  `packages/` found 72 errors in 15 files (after excluding `test/`,
  `scripts/`, and the broken `?title=` test-import convention, a
  separate problem). 2 were real, live bugs the type checker caught,
  not annotation gaps: `shipNames.js`'s `shuffle()` compared a function
  to a number instead of calling it - name pools never shuffled.
  `previewRig`'s argument type had an optional/required mismatch.
- cost: jsdoc for real generics and unions (event envelopes keyed by
  `event_type`, the module resolver's `flat | percent` effect union)
  is verbose - it is ts's type system wearing a comment.
- **this is the scoped step 3.8. picked first**: smallest change that
  fixes the actual complaint, and already proven at the real error
  count above.

#### option 2 - full typescript migration, `.js` → `.ts`

- same type system as option 1, cleaner syntax for the expressive
  shapes - real unions, real generics, no comment-costume.
- node 26 strips ts type syntax at load time. `npm start`/`npm test`
  calling `node` directly can very plausibly keep working with no
  transpile step - needs a small spike to confirm before committing,
  not assumed.
- incremental: `allowJs` already lets `.js` and `.ts` coexist, so one
  package at a time, same as today's transition state.
- real cost past option 1: renaming files, import-extension churn, and
  retiring 14 packages' worth of `types/*.d.ts` in favor of inline
  types - mechanical, not deep, but not small either.
- **not now. revisit once step 3.8 is done** - option 1 will have
  already surfaced every real annotation gap; going to `.ts` after that
  is a syntax change, not a fresh type-hunting pass.

#### option 3 - rewrite in go

a different kind of decision - a rewrite, not a typing fix.

- what it would buy: goroutines/channels fit the poll-loop pattern
  already used everywhere (`pollOutbox`, `pollArrivals`, `pollDrift`);
  one static binary per service, which answers the open "dockerize the
  game" item above directly; `pgx` is a strong typed postgres client.
- what it costs: everything. 5 apps, 9 packages, and the hand-rolled
  `garage` framework this whole project sits on (`garage/util`,
  `garage/sync`, `garage/mw/ws`, `garage/compose`) - none of that
  exists in go, all of it gets rebuilt from scratch. plus the hand-rolled
  websocket protocol, the outbox/inbox saga machinery, every contract
  validator, every test.
- go's type system (no unions, weaker structural typing) makes this
  domain's actual shapes - event envelopes discriminated by
  `event_type`, `requires`/`provides`/`effects` - more verbose to model,
  not less.
- solo-maintained, mid-feature (ship modules, phase 3, is not done). a
  language swap is a multi-week-to-multi-month parallel-implementation
  project, with real risk of stalling game progress, to solve problems
  ("typings became a problem") that are not the ones go actually
  answers.
- **set aside. not a fix for the stated problem** - worth a real look
  only if a genuine perf/deployment/concurrency wall shows up later,
  which has not happened yet.


nice to have
----------------

- a mechanism to add new game assets
- implement db connection and query with new `using` and `Symbol.dispose` API
    - [explicit-resource-management](https://v8.dev/features/explicit-resource-management)
    - [using keyword](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/using)
    - fits `packages/db/src/query.js`'s `withClient` only - `withTransaction`
      and `migrate.js` branch on commit vs rollback, not plain cleanup
    - **deferred to phase 4** - see [phase.4.md](phase.4.md) tech debt
