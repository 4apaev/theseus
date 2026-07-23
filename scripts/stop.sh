#!/usr/bin/env bash
# graceful shutdown of everything scripts/start.sh booted - SIGTERM,
# then wait for each service's own stop() to actually finish.
#   npm stop

shopt -s nullglob
files=(.logs/*.pid)

if [ ${#files[@]} -eq 0 ]; then
    echo "nothing running (no .logs/*.pid found)"
    exit 0
fi

for f in "${files[@]}"; do
    name=$(basename "$f" .pid)
    pid=$(cat "$f")
    if kill -0 "$pid" 2>/dev/null; then
        kill "$pid"
        echo "stopping $name (pid $pid)"
    else
        echo "$name (pid $pid) already gone"
    fi
done

echo "waiting for graceful shutdown..."
for f in "${files[@]}"; do
    pid=$(cat "$f")
    while kill -0 "$pid" 2>/dev/null; do sleep 0.5; done
done

rm -f "${files[@]}"
echo "stopped"
