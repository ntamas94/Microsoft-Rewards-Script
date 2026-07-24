#!/usr/bin/env bash
# Brings up the virtual display stack, then runs the requested mode.
#
#   signin  - keep the container alive so you can sign in to Edge over noVNC (one-off)
#   status  - print the current Rewards counters and exit
#   run     - browse until the daily 30 minutes are credited
#   loop    - run, then sleep and run again (LOOP_HOURS, default 24)

set -euo pipefail

DISPLAY_NUM="${DISPLAY_NUM:-99}"
export DISPLAY=":${DISPLAY_NUM}"
SCREEN_SIZE="${SCREEN_SIZE:-1920x1080x24}"
VNC_PORT="${VNC_PORT:-5900}"
NOVNC_PORT="${NOVNC_PORT:-6080}"
ENABLE_VNC="${ENABLE_VNC:-1}"
LOOP_HOURS="${LOOP_HOURS:-24}"

cleanup() {
    pkill -P $$ 2>/dev/null || true
}
trap cleanup EXIT

Xvfb "${DISPLAY}" -screen 0 "${SCREEN_SIZE}" -nolisten tcp &

for _ in $(seq 1 40); do
    if xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then break; fi
    sleep 0.25
done

if ! xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then
    echo "entrypoint: Xvfb did not come up on ${DISPLAY}" >&2
    exit 1
fi

# Without a window manager the Edge window can never be activated, so the focus keeper is a no-op
fluxbox >/dev/null 2>&1 &

if [ "${ENABLE_VNC}" = "1" ]; then
    x11vnc -display "${DISPLAY}" -forever -shared -nopw -quiet -rfbport "${VNC_PORT}" >/dev/null 2>&1 &
    websockify --web=/usr/share/novnc "${NOVNC_PORT}" "localhost:${VNC_PORT}" >/dev/null 2>&1 &
    echo "entrypoint: noVNC on http://<host>:${NOVNC_PORT}/vnc.html (no password - keep it off the internet)"
fi

case "${1:-run}" in
    signin)
        echo "entrypoint: starting Edge for the one-off sign-in"
        microsoft-edge-stable \
            --no-sandbox \
            --disable-dev-shm-usage \
            --user-data-dir="${EDGE_USER_DATA_DIR:-/profile}" \
            --no-first-run \
            --no-default-browser-check \
            --window-size=1920,1080 \
            "https://rewards.bing.com/" &
        echo "entrypoint: open noVNC, sign in to Edge itself, then stop this container"
        wait
        ;;
    status)
        exec node /app/index.mjs --status
        ;;
    run)
        exec node /app/index.mjs
        ;;
    loop)
        while true; do
            node /app/index.mjs || echo "entrypoint: run failed, retrying after the interval"
            echo "entrypoint: sleeping ${LOOP_HOURS}h"
            sleep "${LOOP_HOURS}h"
        done
        ;;
    *)
        exec "$@"
        ;;
esac
