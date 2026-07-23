#!/usr/bin/env bash
# boot every service + the gateway for local play - logs in ./logs,
# pids in ./.pids so stop.sh can shut them down gracefully.
#   npm start        - infra must already be up (npm run infra:up)

set -e
mkdir -p logs .pids

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
    node --env-file=./.env "${paths[$i]}" > "logs/${name}.log" 2>&1 &
    echo $! > ".pids/${name}.pid"
done

echo "waiting for services to boot..."
sleep 3

grep -h "booted\|Error" logs/*.log 2>/dev/null | grep -v kafkajs || true
curl -s -o /dev/null -w "gateway http -> %{http_code}\n" http://localhost:3000/ \
    || echo "gateway not responding yet - check logs/gateway.log"

echo "started - logs in ./logs, stop with: npm stop"
