#!/usr/bin/env bash
# Keeps the Edge window active on the container's X display.
# Edge only credits *active* browsing time, so an unfocused window earns nothing.
# The Windows counterpart is keep-awake.ps1; index.mjs picks one by platform.

set -uo pipefail

EDGE_PID="${1:?usage: keep-awake.sh <edge-pid> [interval-seconds]}"
INTERVAL="${2:-20}"

echo "keep-awake: watching PID ${EDGE_PID} on DISPLAY=${DISPLAY:-unset}"

while kill -0 "${EDGE_PID}" 2>/dev/null; do
    window="$(xdotool search --onlyvisible --class 'microsoft-edge' 2>/dev/null | head -n1)"

    if [ -n "${window}" ]; then
        xdotool windowactivate --sync "${window}" 2>/dev/null || true
        xdotool windowfocus "${window}" 2>/dev/null || true
    fi

    sleep "${INTERVAL}"
done

echo "keep-awake: Edge process is gone, exiting"
