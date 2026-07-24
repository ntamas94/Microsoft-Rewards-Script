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

# Edge floods the log with "Failed to connect to the bus" and falls back on an
# odd credential store without one - and the credential store is what keeps the
# Microsoft sign-in alive between runs.
mkdir -p /run/dbus
if [ ! -S /run/dbus/system_bus_socket ]; then
    dbus-daemon --system --fork
fi
DBUS_SESSION_BUS_ADDRESS="$(dbus-daemon --session --fork --print-address)"
export DBUS_SESSION_BUS_ADDRESS

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

# Chromium stores "hostname-pid" in SingletonLock. Every container run gets a fresh
# hostname, so a lock left behind by an unclean stop makes Edge refuse to start with
# "in use by another Microsoft Edge process on another computer". Exactly one container
# owns this profile at a time, so a leftover lock is always stale.
clear_stale_locks() {
    local profile_dir="${EDGE_USER_DATA_DIR:-/profile}"

    if pgrep -x msedge >/dev/null 2>&1; then
        echo "entrypoint: Edge is already running in this container, leaving the profile lock alone"
        return
    fi

    for lock in SingletonLock SingletonSocket SingletonCookie; do
        if [ -e "${profile_dir}/${lock}" ] || [ -L "${profile_dir}/${lock}" ]; then
            rm -f "${profile_dir}/${lock}"
            echo "entrypoint: removed stale ${lock}"
        fi
    done
}

# Chromium keeps the signed-in account in Preferences and writes it lazily. Killing the
# container right after signing in loses exactly the thing the sign-in was for, so Edge
# gets a SIGTERM and time to flush before anything else is torn down.
shutdown_edge() {
    local pid="$1"

    kill -0 "${pid}" 2>/dev/null || return 0

    echo "entrypoint: shutting Edge down cleanly, this takes a few seconds"
    kill -TERM "${pid}" 2>/dev/null || true

    for _ in $(seq 1 40); do
        kill -0 "${pid}" 2>/dev/null || break
        sleep 0.5
    done

    if kill -0 "${pid}" 2>/dev/null; then
        echo "entrypoint: Edge did not exit in 20s, forcing it" >&2
        kill -KILL "${pid}" 2>/dev/null || true
    fi
}

report_signin_state() {
    local prefs="$1/Default/Preferences"

    if [ -f "${prefs}" ] && grep -q '"account_info"' "${prefs}" 2>/dev/null; then
        echo "entrypoint: a signed-in account is stored in the profile - you are done here"
    else
        echo "entrypoint: WARNING - no signed-in account in the profile, the sign-in did not persist" >&2
    fi
}

clear_stale_locks

case "${1:-run}" in
    signin)
        profile_dir="${EDGE_USER_DATA_DIR:-/profile}"
        mkdir -p "${profile_dir}"

        # Chromium needs a filesystem with symlinks and file locking. A bind mount from an
        # ntfs/exfat/network disk silently fails to start, which looks like a black VNC screen.
        echo "entrypoint: profile ${profile_dir} on $(stat -f -c %T "${profile_dir}" 2>/dev/null || echo unknown) filesystem"
        if ! ln -sf . "${profile_dir}/.symlink-test" 2>/dev/null; then
            echo "entrypoint: WARNING - cannot create symlinks in ${profile_dir}; Edge will not start there." >&2
            echo "entrypoint: use a directory on a Linux filesystem (ext4/xfs/btrfs) instead." >&2
        fi
        rm -f "${profile_dir}/.symlink-test"

        echo "entrypoint: starting Edge for the one-off sign-in"
        microsoft-edge-stable \
            --no-sandbox \
            --disable-dev-shm-usage \
            --disable-gpu \
            --password-store=basic \
            --user-data-dir="${profile_dir}" \
            --no-first-run \
            --no-default-browser-check \
            --window-size=1920,1080 \
            "https://rewards.bing.com/" &
        edge_pid=$!

        sleep 8
        if ! kill -0 "${edge_pid}" 2>/dev/null; then
            echo "entrypoint: Edge exited immediately - see its output above" >&2
            exit 1
        fi
        if [ -z "$(xdotool search --onlyvisible --class 'microsoft-edge' 2>/dev/null | head -n1)" ]; then
            echo "entrypoint: Edge is running but has mapped no window on ${DISPLAY}" >&2
        else
            echo "entrypoint: Edge window is up on ${DISPLAY}"
        fi

        echo "entrypoint: open noVNC, sign in to Edge itself, then press Ctrl+C here (or close the window)"
        trap 'shutdown_edge "${edge_pid}"' INT TERM
        wait "${edge_pid}" || true
        shutdown_edge "${edge_pid}"
        report_signin_state "${profile_dir}"
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
