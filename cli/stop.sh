#!/bin/sh
# Stops the `shiniri-cli watch` started by start.sh. Adapted from ambil's stop.sh.

cd "$(dirname "$0")" || exit 1

PIDFILE="./data/watch.pid"

if [ ! -f "$PIDFILE" ]; then
  echo "⚠️ No PID file found. Is watch running?"
  exit 0
fi

PID=$(cat "$PIDFILE")
if [ -z "$PID" ] || ! kill -0 "$PID" 2>/dev/null; then
  echo "⚠️ PID ${PID:-?} is not running. Removing stale PID file."
  rm -f "$PIDFILE"
  exit 0
fi

echo "🛑 Stopping watch (PID $PID)..."
kill "$PID"
# Wait up to 10 s; remove the PID file only once the process is gone
i=0
while kill -0 "$PID" 2>/dev/null; do
  if [ "$i" -ge 10 ]; then
    echo "❌ PID $PID still running after 10 s. Try: kill -9 $PID"
    exit 1
  fi
  sleep 1
  i=$((i + 1))
done
rm -f "$PIDFILE"
echo "✅ Stopped."
