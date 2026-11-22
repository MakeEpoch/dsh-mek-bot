#!/bin/sh
# Isolated DSH Web bench with the scripted mock model and a package built from this
# checkout. Rebuild client.js before restarting the bench after a client change.
#
#   dev/bench.sh <name> <web-port> <mock-port> [start|stop|reset|status]
#
# Data lives in <checkout>/.dsh-test-<name>; `reset` wipes its Bot team and Sessions before
# starting. Processes are tracked by pid files and stopped by process group, never by name.
# Environment: CONTEXT_WINDOW (the mock models' context window, in tokens, with an 8,000
# token reply; default: the adapter's own), CHECK_RATIO (the plugin's checkRatio), MOCK_DELAY_MS,
# DSH_CLI (the DSH CLI to launch, defaults to dsh from PATH).
set -eu
NAME=${1:?usage: bench.sh <name> <web-port> <mock-port> [start|stop|reset|status]}
WEB_PORT=${2:?usage: bench.sh <name> <web-port> <mock-port> [start|stop|reset|status]}
MOCK_PORT=${3:?usage: bench.sh <name> <web-port> <mock-port> [start|stop|reset|status]}
ACTION=${4:-start}
case "$NAME" in *[!a-z0-9-]*|'') echo "bench name must match [a-z0-9-]+" >&2; exit 1 ;; esac
if [ "$WEB_PORT" = 3080 ]; then echo "port 3080 belongs to the real service" >&2; exit 1; fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="$ROOT/.dsh-test-$NAME"
DSH_CLI=${DSH_CLI:-dsh}

alive() { [ -f "$HOME_DIR/$1.pid" ] && kill -0 "-$(cat "$HOME_DIR/$1.pid")" 2>/dev/null; }

# Each process runs in its own session (setsid), so its pid is also its process group, which
# outlives it: pnpm exits before the dsh it started. The process writes its own pid: the `$!`
# of a background job is the subshell that runs setsid, not the session leader it forks, so
# it cannot name the group to keep and stop. dash's kill takes no `--`.
stop_one() {
  file="$HOME_DIR/$1.pid"
  [ -f "$file" ] || return 0
  pid=$(cat "$file")
  kill -TERM "-$pid" 2>/dev/null || true
  i=0
  while kill -0 "-$pid" 2>/dev/null && [ $i -lt 50 ]; do sleep 0.2; i=$((i + 1)); done
  kill -KILL "-$pid" 2>/dev/null || true
  rm -f "$file"
}

ensure_profile() {
  profile="$HOME_DIR/profiles/web"
  bundle=$(cd "$ROOT" && npm pack --ignore-scripts --pack-destination "$HOME_DIR" --silent)
  bundle="$HOME_DIR/$bundle"
  digest=$(sha256sum "$bundle" | cut -c1-16)
  candidate="${bundle%.tgz}-$digest.tgz"
  mv -f "$bundle" "$candidate"
  if [ -f "$HOME_DIR/installed-package" ] && [ "$(cat "$HOME_DIR/installed-package")" = "$digest" ] &&
      cmp -s "$ROOT/client.js" "$profile/node_modules/dsh-mek-bot/client.js"; then
    return 0
  fi
  mkdir -p "$profile"
  if [ ! -f "$profile/pnpm-workspace.yaml" ]; then
    printf 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n' > "$profile/pnpm-workspace.yaml"
  fi
  DSH_HOME="$HOME_DIR" "$DSH_CLI" plugin --profile web add -w "$candidate"
  printf '%s\n' "$digest" > "$HOME_DIR/installed-package"
}

# Bench-only plugin config, layered over the profile with --patch.
write_overlay() {
  overlay="$HOME_DIR/bench.patch.yml"
  printf '[]\n' > "$overlay"
  if [ -n "${CHECK_RATIO:-}" ]; then
    printf -- '- id: mek-bot\n  config:\n    checkRatio: %s\n' "$CHECK_RATIO" > "$overlay"
  fi
  if [ -n "${CONTEXT_WINDOW:-}" ]; then
    [ -n "${CHECK_RATIO:-}" ] || : > "$overlay"
    {
      printf -- '- id: llm-deepseek\n  config:\n    models:\n'
      printf -- '      - { id: deepseek-flash, contextWindow: %s, maxTokens: 8000, inputModalities: [text, image] }\n' "$CONTEXT_WINDOW"
      printf -- '      - { id: deepseek-v4-pro, contextWindow: %s, maxTokens: 8000 }\n' "$CONTEXT_WINDOW"
    } >> "$overlay"
  fi
}

start() {
  mkdir -p "$HOME_DIR"
  ensure_profile
  write_overlay
  if ! alive mock; then
    rm -f "$HOME_DIR/mock.pid"
    (cd "$ROOT" && MOCK_PORT="$MOCK_PORT" MOCK_DELAY_MS="${MOCK_DELAY_MS:-300}" MOCK_LOG_TOOLS=1 MOCK_LOG="$HOME_DIR/mock.jsonl" \
      exec setsid sh -c 'set -eu; echo $$ >"$1"; shift; exec "$@"' sh "$HOME_DIR/mock.pid" \
      node dev/mock-llm.mjs "$HOME_DIR") </dev/null >"$HOME_DIR/mock.out" 2>&1 &
    # The mock writes its own pid just before it starts; wait for the file so a
    # status or stop right after start does not miss a mock still coming up.
    i=0
    while [ ! -f "$HOME_DIR/mock.pid" ] && [ $i -lt 50 ]; do i=$((i + 1)); sleep 0.1; done
  fi
  if ! alive web; then
    log="$HOME_DIR/web.log"
    rm -f "$log" "$HOME_DIR/web.pid"
    (cd "$ROOT" && DSH_HOME="$HOME_DIR" DEEPSEEK_BASE_URL="http://127.0.0.1:$MOCK_PORT/v1" DEEPSEEK_API_KEY=mock-key \
      exec setsid sh -c 'set -eu; echo $$ >"$1"; shift; exec "$@"' sh "$HOME_DIR/web.pid" \
      "$DSH_CLI" --profile web --patch "$HOME_DIR/bench.patch.yml" \
      --no-open --port "$WEB_PORT") </dev/null >"$log" 2>&1 &
    # The process writes its own pid just before dsh starts; wait for that file so a
    # start still in progress is not read as an exit.
    i=0
    while [ ! -f "$HOME_DIR/web.pid" ] && [ $i -lt 50 ]; do i=$((i + 1)); sleep 0.1; done
    i=0
    until grep -q "dsh web: http" "$log" 2>/dev/null; do
      i=$((i + 1))
      if [ $i -gt 120 ] || ! alive web; then echo "dsh web did not start; see $log" >&2; tail -20 "$log" | grep -v 'token=' >&2; exit 1; fi
      sleep 1
    done
  fi
  status
}

status() {
  for name in mock web; do
    if alive $name; then echo "$name: running (pid $(cat "$HOME_DIR/$name.pid"))"; else echo "$name: stopped"; fi
  done
  echo "home: $HOME_DIR  web: http://127.0.0.1:$WEB_PORT  mock: $MOCK_PORT"
}

case "$ACTION" in
  start) start ;;
  stop) stop_one web; stop_one mock; status ;;
  reset)
    stop_one web
    stop_one mock
    rm -f "$HOME_DIR/mock.jsonl" "$HOME_DIR/cookies.txt"
    rm -rf "$HOME_DIR/mek-bot" "$HOME_DIR"/sessions/*workspace*/session-*
    start
    ;;
  status) status ;;
  *) echo "unknown action $ACTION" >&2; exit 1 ;;
esac
