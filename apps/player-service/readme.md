🚀 theseus 🎮 player-service
================================================================

owns:
- `players` write model.
- `wallets` write model.
- sessions, if stored

consumes:
- `player.register.requested.v1`
- `wallet.debit.requested.v1`
- `wallet.credit.requested.v1`

emits:
- `player.created.v1`
- `player.registration.rejected.v1`
- `wallet.created.v1`
- `wallet.debited.v1`
- `wallet.credited.v1`
- `wallet.transaction.rejected.v1`

all writes go through outbox in the same transaction.
