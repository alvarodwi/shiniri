#!/bin/sh
# Starts `shiniri-cli watch` in the background. Adapted from ambil's start.sh.

set -eu

cd "$(dirname "$0")" || exit 1

PIDFILE="./data/watch.pid"
LOGDIR="./data/logs"
LOGLINK="./data/watch.log"
KEEP_LOGS=5

# Refuse a second start while the last one is still running
if [ -f "$PIDFILE" ]; then
  OLD_PID=$(cat "$PIDFILE")
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "⚠️ Already running with PID $OLD_PID. Run ./stop.sh first."
    exit 1
  fi
fi

# Install exactly what uv.lock pins, then run the venv's entry point directly so the PID
# we save is the Python process itself (stop.sh signals it, not a uv wrapper).
uv sync --frozen --quiet

mkdir -p "$LOGDIR"
LOGFILE="$LOGDIR/watch-$(date +%Y%m%d-%H%M%S).log"
: > "$LOGFILE"
ln -sfn "logs/$(basename "$LOGFILE")" "$LOGLINK"
# Keep only the newest session logs (names have no spaces, so word splitting is safe)
# shellcheck disable=SC2012
ls -1t "$LOGDIR"/watch-*.log | tail -n +$((KEEP_LOGS + 1)) | xargs -r rm -f --

echo "🚀 Starting shiniri-cli watch in background..."
echo "📁 Working dir: $(pwd)"
echo "📄 Logging to: $LOGFILE (latest: $LOGLINK)"

nohup ./.venv/bin/shiniri-cli watch > "$LOGFILE" 2>&1 &
APP_PID=$!
echo "$APP_PID" > "$PIDFILE"

# Give it a moment, then check it is still alive
sleep 1
if kill -0 "$APP_PID" 2>/dev/null; then
  echo "✅ Started with PID $APP_PID"
else
  rm -f "$PIDFILE"
  echo "❌ Failed to start. Check $LOGFILE for details."
  exit 1
fi
