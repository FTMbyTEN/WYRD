#!/usr/bin/env bash
# Starts the simulated copter (ArduPilot SITL) with no 3D view, to keep RAM use low.
#   bash /mnt/c/Users/TEN/consciousness-bot/drone/run-sitl.sh
#
# The drone "takes off" from a field in Lagos by default -- override with LOCATION=lat,lon,alt,heading.
# MAVLink is served on UDP port 14550 (reachable from Windows too), which is what WYRD's drone
# bridge -- and any ground station like Mission Planner or QGroundControl -- connects to.
set -euo pipefail

LOCATION="${LOCATION:-6.5244,3.3792,10,0}"
cd "$HOME/ardupilot"
# shellcheck disable=SC1090
source "$HOME/.profile"

# Windows host IP as seen from inside WSL, so the MAVLink stream reaches Windows-side tools.
WIN_HOST="$(ip route show default | awk '{print $3}')"

# HEADLESS=1: no MAVProxy console window or prompt, for running in the background or from
# scripts (Windows 10's WSL has no Linux GUI support anyway).
if [ "${HEADLESS:-0}" = "1" ]; then
  MAVPROXY_UI=(--mavproxy-args="--daemon --non-interactive")
else
  MAVPROXY_UI=(--console)
fi

exec Tools/autotest/sim_vehicle.py -v ArduCopter \
  --custom-location="$LOCATION" \
  --no-rebuild \
  --out="udp:${WIN_HOST}:14550" \
  --out="udp:127.0.0.1:14550" \
  "${MAVPROXY_UI[@]}"
