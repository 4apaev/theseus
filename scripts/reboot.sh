#!/usr/bin/env bash

set -e
mkdir -p .logs

if (( $# == 0 )); then
    echo "restarting all services (no args)"
    npm stop
    npm start
    exit 0
fi

################################################
pid=$(cat ".logs/$1.pid" 2>/dev/null || true)

if [ -z "$pid" ]; then
    echo "$1 service is not running"
    exit 0
fi

################################################
if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "stopping $1 (pid $pid)"
else
    echo "$1 (pid $pid) already gone"
fi

################################################
found=
for a in apps/*; do
    if [[ $a == "apps/$1"* ]]; then
        found=1
        echo "starting ${a}"
        node --env-file=./.env "${a}/src/main.js" > ".logs/$1.log" 2>&1 &
        echo $! > ".logs/$1.pid"
        break
    fi
done

if [ -z "$found" ]; then
    echo "unknown service '$1' - no apps/$1* directory"
    exit 1
fi

################################################

echo "waiting for $1 to boot..."
sleep 3
grep -h "booted\|Error" .logs/$1.log 2>/dev/null | grep -v kafkajs || true
curl -s -o /dev/null -w "http -> %{http_code}" \
    http://localhost:3000 \
    || echo "gateway not responding yet - check .logs/gateway.log"