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


### infra: deploy

dockerize the game. need a real plan for this.
uptime check is a dev tool, not a production health check,
when this step lands, will be replaced with systemd/container-native
health check


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