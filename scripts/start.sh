#!/usr/bin/env bash
# boot every service + the gateway for local play - logs and pids
# both in ./.logs so stop.sh can shut them down gracefully.
#   npm start        - infra must already be up (npm run infra:up)

set -e
mkdir -p .logs

names=(player ship market projection gateway)
paths=(
    apps/player-service/src/main.js
    apps/ship-service/src/main.js
    apps/market-service/src/main.js
    apps/projection-service/src/main.js
    apps/gateway/src/main.js
)

for i in "${!names[@]}"; do
    name=${names[$i]}
    pidfile=".logs/${name}.pid"

    # a live pid here shows that this service already runs.
    # starting a second copy duplicates its poll loops. for example,
    # a second copy of drift.js moves stock at twice the normal rate.
    # a second copy also overwrites this pidfile. as a result, npm
    # stop then loses track of the first copy.
    if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
        echo "$name already running (pid $(cat "$pidfile")) - skipping"
        continue
    fi

    node --env-file=./.env "${paths[$i]}" > ".logs/${name}.log" 2>&1 &
    echo $! > "$pidfile"
done

echo "waiting for services to boot..."
sleep 3

grep -h "booted\|Error" .logs/*.log 2>/dev/null | grep -v kafkajs || true
curl -s -o /dev/null -w "gateway http -> %{http_code}\n" http://localhost:3000/ \
    || echo "gateway not responding yet - check .logs/gateway.log"

echo "started - logs in ./.logs, stop with: npm stop"
