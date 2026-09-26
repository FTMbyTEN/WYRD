# WYRD drone

WYRD is being prepared to be the mission-level intelligence behind a drone: it decides *where to
go and why*, while a real autopilot (ArduPilot) does the actual flying — stabilization, motor
control and failsafes, hundreds of times a second. WYRD never sits in that fast loop.

```
WYRD (Serverpod, cloud)  ──►  drone bridge (this folder)  ──MAVLink──►  ArduPilot
   plans missions              safety gate + mission runner              SITL on your PC now,
                                                                         a real flight controller later
```

On a real drone the bridge runs on the small companion computer next to the flight controller.

## Simulator (ArduPilot SITL in WSL)

1. Install Ubuntu in WSL — **PowerShell as Administrator**: `wsl --update`, then
   `wsl --install -d Ubuntu-24.04`, and create your Linux user.
2. Inside Ubuntu, build the simulator once (~30–60 min):
   `bash /mnt/c/Users/TEN/consciousness-bot/drone/setup-sitl.sh`
3. Start it: `bash /mnt/c/Users/TEN/consciousness-bot/drone/run-sitl.sh`
   (starts over Lagos; override with `LOCATION=lat,lon,alt,heading`). It streams MAVLink on UDP 14550.

## Bridge

```bash
cd drone/bridge
npm install
npm start      # connects to the autopilot on UDP 14550, control API on http://127.0.0.1:8765
npm test
```

| Endpoint | |
| --- | --- |
| `GET /state` | live telemetry (mode, armed, position, altitude, battery, GPS) + mission status |
| `POST /command` | one command: `{"type":"takeoff","altitudeM":10}`, `{"type":"goto","lat":..,"lon":..,"altitudeM":..}`, `hold`, `rtl`, `land` |
| `POST /mission` | `{"steps":[ ...commands... ]}` run in order |
| `POST /abort` | cancel and return home |

The API listens on `127.0.0.1` only. Refused commands come back as `422` with the reason.

### Safety rules

Every command is checked before it's sent (`src/safety.js`), and a watchdog checks the flight
twice a second:

- **Limits** (defaults): ceiling 60 m, geofence 300 m from home, takeoff needs a 3D GPS fix and
  ≥ 50 % battery, in flight below 30 % → return home.
- **No fresh telemetry → no commands**, except the ones that only make things safer (`rtl`,
  `land`, `hold`), which are always allowed.
- **Whole missions are checked up front** — every waypoint against the fence and altitude
  limits — before anything is sent. Waypoints are refused until the home position is known.
- **Any violation in flight → return home** (unless already returning or landing).
- **Manual override always wins**: if the flight mode changes to anything the bridge didn't ask
  for, the mission is cancelled and the bridge stops sending commands. It never fights a human.
- ArduPilot's own failsafes (battery, GPS, fence, lost link) still apply underneath all of this.

## Next

- Serverpod side: a `drone` endpoint WYRD uses to receive telemetry and hand out missions, and a
  chat tool so you can ask WYRD to plan a flight in plain language (checked by the same rules).
- First real test: fly a small square over the simulated field.
- Before any real flight: check NCAA (Nigeria) drone regulations.
