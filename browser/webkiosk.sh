#!/usr/bin/env bash
# webkiosk.sh - flexible launcher for Chromium/Firefox/etc.

set -euo pipefail

URL="https://example.com"
BROWSER="chromium"    # chromium|thorium|google-chrome|brave|firefox|custom
INCOGNITO=1
APP_MODE=1
KIOSK=0
WINDOWED=1
WIDTH=""
HEIGHT=""
POS_X=""
POS_Y=""
EXTRA_ARGS=()
DRY_RUN=0

usage() {
cat <<EOF
Usage: $0 [options]

Options:
  -u, --url URL              URL or file to open
  -b, --browser NAME         Browser: chromium|thorium|google-chrome|brave|firefox|custom
                             (default: $BROWSER)

Window / display options:
      --kiosk                Enable full-screen kiosk mode
      --windowed             Force windowed mode (default)
      --width N              Window width
      --height N             Window height
      --pos-x N              Window position X
      --pos-y N              Window position Y

Browser behavior:
      --no-incognito         Disable incognito/private mode
      --no-app               Disable --app=URL (Chromium)
      --extra "ARGS"         Extra flags passed directly to the browser
      --dry-run              Print the command without running it

Help:
  -h, --help                 Show this help and exit

Examples:
  $0 -u https://example.com
  $0 -b thorium -u file:///home/me/ui/index.html --windowed --width 1200 --height 800
  $0 -b firefox -u https://panel.local --kiosk
EOF
}

# --- Argument parser ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    -u|--url) URL="$2"; shift 2;;
    -b|--browser) BROWSER="$2"; shift 2;;
    --no-incognito) INCOGNITO=0; shift;;
    --no-app) APP_MODE=0; shift;;
    --extra) EXTRA_ARGS+=("$2"); shift 2;;

    --kiosk) KIOSK=1; WINDOWED=0; shift;;
    --windowed) WINDOWED=1; KIOSK=0; shift;;
    --width) WIDTH="$2"; shift 2;;
    --height) HEIGHT="$2"; shift 2;;
    --pos-x) POS_X="$2"; shift 2;;
    --pos-y) POS_Y="$2"; shift 2;;

    --dry-run) DRY_RUN=1; shift;;
    -h|--help) usage; exit 0;;

    *) echo "Unknown option: $1"; exit 1;;
  esac
done

# Build command
cmd=()

case "$BROWSER" in
  chromium|google-chrome|brave|thorium)
    cmd+=("$BROWSER")

    # kiosk vs windowed
    if [[ "$KIOSK" -eq 1 ]]; then
      cmd+=(--kiosk)
    fi

    # app mode / normal
    if [[ "$APP_MODE" -eq 1 ]]; then
      cmd+=("--app=$URL")
    else
      cmd+=("$URL")
    fi

    [[ "$INCOGNITO" -eq 1 ]] && cmd+=(--incognito)

    # window size / position
    if [[ -n "$WIDTH" && -n "$HEIGHT" ]]; then
      cmd+=( "--window-size=${WIDTH},${HEIGHT}" )
    fi
    if [[ -n "$POS_X" && -n "$POS_Y" ]]; then
      cmd+=( "--window-position=${POS_X},${POS_Y}" )
    fi

    cmd+=( --no-first-run --no-default-browser-check )
    ;;

  firefox)
    cmd+=("firefox")

    if [[ "$KIOSK" -eq 1 ]]; then
      cmd+=(--kiosk)
    fi

    if [[ "$INCOGNITO" -eq 1 ]]; then
      cmd+=(--private-window)
    fi

    cmd+=("$URL")
    ;;

  custom)
    if [[ -z "${WEBKIOSK_CUSTOM_CMD:-}" ]]; then
      echo "Error: BROWSER=custom but WEBKIOSK_CUSTOM_CMD is not set." >&2
      exit 1
    fi
    # shellcheck disable=SC2206
    cmd=($WEBKIOSK_CUSTOM_CMD "$URL")
    ;;

  *)
    echo "Unsupported browser: $BROWSER" >&2
    exit 1;;
esac

# Add extra args
cmd+=("${EXTRA_ARGS[@]}")

# Dry run mode
if [[ "$DRY_RUN" -eq 1 ]]; then
  printf 'Command: '
  printf '%q ' "${cmd[@]}"
  echo
  exit 0
fi

exec "${cmd[@]}"
