tech debt
================


debt
----------------

### bug: missing ship
after game restart, the ship is no longer recognizable by the game.
when buying/selling goods, the trade is rejected with `missing ship` message.

seems like infra/game restart issue, but why only the ship is missing?
the other db entities are ok, like player itself etc...
only the ship is affected.


### db

- indexes
- annotated diagrams of tables + comments on every field
- annotated diagrams of system wide layout


### infra

- #### db
    to avoid conflicts when branch switching,
    create dedicated db per branch (on demand, not auto).
    in case when branch alters/changes db structure,
    create a branch specific dbs.
    see `ship-upgrades` vs `ship-modules` branch conflicts

- #### deploy
    dockerize the game. need a real plan for this.
    uptime check is a dev tool, not a production health check,
    when this step lands, will be replaced with systemd/container-native
    health check

- #### load tests
    see how theseus behaves under load



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
  `previewLoadout`'s argument type had an optional/required mismatch.
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



### frontend lib
react like or custom elements [lit.dev](https://lit.dev/)
with template syntax like jade/pug for html.
and stylus/sass syntax for css.
could be dedicated library, not nesessery part of `theseus`, but as repo


```pug
body
    //- stylus/sass like syntax for css
    style
        body
            color       $fg
            background  $bg
            font        14px/1.5 ui-monospace, 'SF Mono', Menlo, Consolas, monospace
            padding     1rem
            height      100vh
            shadow      0 0 6px rgba(51, 255, 102, .35)

        h2
            color     $dimtext
            font-size 12px
            letter-spacing .2em
            margin-bottom  .5rem

            &::before
                content '── '

            &::after
                content ' ──'

    header
        h1.brand theseus

    main#auth.auth
        h2 DOCKING CLEARANCE

        input#handle(required type=text placeholder=handle autocomplete=username)
        input#password(required type=password placeholder=password autocomplete=current-password)

        button#login LOGIN
        button#register REGISTER

        p#auth-msg.auth-msg

    main#game

        section.wallet
            h2 wallet
            div.wallet-body
                p.money ₢3912.02
                p.dim Alice

        section.ship
            h2 ship
            div.ship-body
                p "far treasure"
```