tech debt
================


debt
----------------
- add `NODE_ENV = dev | prod | test`
    - turn off logging in gateway if `NODE_ENV == test`
    - `NODE_ENV` should affect `garage/compose` - add test

- move db related helpers from @theseus/util to @theseus/db
- refactor apps/{service}/src/handlers.js
    replace
    ```js
    export function createHandlers(pool, transact) {
        return {
            [ CMD.service.action ]() {...},
            [ EVT.service.event ]() {...},
        }
    }
    ```

    with
    ```js
    export function createHandlers(pool, transact) {
        return {
            [ CMD.service.action ]: fxServiceAction,
            [ EVT.service.event  ]: fxServiceEvent,

            function fxServiceAction() {...}
            function fxServiceEvent() {...}
        }
    }
    ```



eve online
----------------
looking at you [eveonline!](https://www.eveonline.com/)     \
make a reasearch of, learn about architecture of this game. \
find good sources/articles to read about.
> some day maybe even add 3D client.


nice to have
----------------
- a mechanism to add new game assets
- dijkstra multi-hop routing once the map outgrows the fully-connected triangle
- implement db connection and query with new `using` and `Symbol.dispose` API
    - [explicit-resource-management](https://v8.dev/features/explicit-resource-management)
    - [using keyword](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/using)



### frontend lib
react like or custom elements [lit.dev](https://lit.dev/)
with template dialect like jade/pug.


```jade
body
    style
        body
            color       $fg
            background  $bg
            font        14px/1.5 ui-monospace, 'SF Mono', Menlo, Consolas, monospace
            padding     1rem
            min-height  100vh
            text-shadow 0 0 6px rgba(51, 255, 102, .35)

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