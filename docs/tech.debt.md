tech debt
================


debt
----------------

### infra: deploy

dockerize the game. need a real plan for this.

### infra: services health script

whos online, status etc

`scripts/services-check.js` and `scripts/infra-health.js` already cover
part of this (service metadata, kafka/postgres/pgadmin reachability).
the rest - **scheduled**, see [phase.3.md](phase.3.md) step 3.2.


### make file
consider adding `make` build. migrate scripts to `make`

**scheduled** - see [phase.3.md](phase.3.md) step 3.2.


### NODE_ENV

add `NODE_ENV = dev | prod | test`
turn off logging in gateway if `NODE_ENV == test`
`NODE_ENV` should affect `garage/compose` - add test.

**scheduled** - see [phase.3.md](phase.3.md) step 3.2.

### ship name generator

**done ✔** - see [phase.3.md](phase.3.md) step 3.1,
`packages/domain/src/shipNames.js`. station names stay fixed, not part
of this.


nice to have
----------------
- a mechanism to add new game assets
- dijkstra multi-hop routing once the map outgrows the fully-connected triangle -
  **done ✔**, see [progress.md](progress.md)
- implement db connection and query with new `using` and `Symbol.dispose` API
    - [explicit-resource-management](https://v8.dev/features/explicit-resource-management)
    - [using keyword](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/using)
    - **scheduled** - see [phase.3.md](phase.3.md) step 3.2



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