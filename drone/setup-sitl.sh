#!/usr/bin/env bash
# Builds ArduPilot's copter firmware as a software-in-the-loop (SITL) simulator inside WSL Ubuntu.
# Run once, from inside Ubuntu:
#   bash /mnt/c/Users/TEN/consciousness-bot/drone/setup-sitl.sh
# Takes ~30-60 min on first run (mostly compiling). Safe to re-run: it resumes where it stopped.
set -euo pipefail

ARDUPILOT_DIR="$HOME/ardupilot"
# A released copter version, not master -- a fixed, tested firmware is what we'd fly for real.
ARDUPILOT_TAG="Copter-4.6.3"

echo "==> Installing build prerequisites (asks for your Ubuntu password once)"
sudo apt-get update
sudo apt-get install -y git python3 python3-pip python3-venv

if [ ! -d "$ARDUPILOT_DIR/.git" ]; then
  echo "==> Cloning ArduPilot $ARDUPILOT_TAG"
  git clone --branch "$ARDUPILOT_TAG" --depth 1 --recurse-submodules --shallow-submodules \
    https://github.com/ArduPilot/ardupilot.git "$ARDUPILOT_DIR"
fi
cd "$ARDUPILOT_DIR"

echo "==> Installing ArduPilot's own dependencies (MAVProxy, pymavlink, compilers)"
# The official script; skips the heavy optional GUI/3D packages we don't need on 8 GB RAM.
DO_AP_STM_ENV=0 SKIP_AP_GRAPHIC_ENV=1 SKIP_AP_COV_ENV=1 SKIP_AP_GIT_CHECK=1 \
  Tools/environment_install/install-prereqs-ubuntu.sh -y
# shellcheck disable=SC1090
source "$HOME/.profile"

echo "==> Building the copter simulator"
./waf configure --board sitl
./waf copter

echo
echo "Done. Start the simulator with:"
echo "  bash /mnt/c/Users/TEN/consciousness-bot/drone/run-sitl.sh"
