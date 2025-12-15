#!/bin/bash

# Source this file (or paste into ~/.zshrc). Usage:
#   uitest                 # start php + webkiosk once (uses current config/ui.json)
#   uitest switch          # pick a config/ui*.json file, apply it, rerun php + webkiosk
#   uitest switch <file>   # apply specific file (path), rerun
#   uitest stop            # stop php server on :2137

uitest() {
  emulate -L zsh
  setopt pipefail no_aliases

  local PORT=2137
  local HOST="localhost"
  local DOCROOT="public"
  local PHP_LOG="ui-test-php-${PORT}.log"

  local ui="config/ui.sample.json"
  local ui_default="config/ui.sample.json"

  _uitest_stop() {
    local pid=""
    if command -v lsof >/dev/null 2>&1; then
      pid="$(lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t 2>/dev/null | head -n1)"
    fi
    if [[ -z "$pid" ]]; then
      pid="$(pgrep -f "php -S ${HOST}:${PORT} -t ${DOCROOT}" | head -n1 2>/dev/null)"
    fi
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
      sleep 0.2
      kill -9 "$pid" 2>/dev/null || true
      print "Stopped PHP server PID=$pid on :$PORT"
    else
      print "No PHP server found on :$PORT"
    fi
  }

  _uitest_start() {
    _uitest_stop
    : > "$PHP_LOG" 2>/dev/null || true
    nohup php -S "${HOST}:${PORT}" -t "${DOCROOT}" >>"$PHP_LOG" 2>&1 &
    local pid=$!
    sleep 0.2
    print "Started PHP server PID=$pid  http://${HOST}:${PORT}   log=${PHP_LOG}"
  }

  _uitest_run() {
    _uitest_start
    bash browser/webkiosk.sh
  }

  _uitest_switch() {
    local chosen="${1:-}"

    if [[ ! -f "$ui" ]]; then
      print "Missing: $ui"
      return 1
    fi

    cp -f "$ui" "$ui_default" || return 1
    print "Saved default: $ui_default"

    if [[ -z "$chosen" ]]; then
      local -a files
      files=(config/ui*.json(N))
      if (( ${#files} == 0 )); then
        print "No files found: config/ui*.json"
        return 1
      fi

      print "Choose UI config to apply -> $ui"
      select chosen in "${files[@]}" "Cancel"; do
        [[ "$REPLY" == "${#files[@]}"+1 ]] && return 0
        [[ -n "$chosen" && -f "$chosen" ]] && break
        print "Invalid choice."
      done
    fi

    if [[ ! -f "$chosen" ]]; then
      print "Not a file: $chosen"
      return 1
    fi

    cp -f "$chosen" "$ui" || return 1
    print "Applied: $chosen -> $ui"
    _uitest_run
  }

  case "${1:-run}" in
    run)    _uitest_run ;;
    switch) shift; _uitest_switch "${1:-}" ;;
    stop)   _uitest_stop ;;
    *)      print "Usage: uitest [run|switch [file]|stop]"; return 2 ;;
  esac
}
