# Drone Navigation Web UI

Modern operations-style dashboard for visualizing autonomous gate navigation with real-time mock mission updates.

## Features

- Responsive dark-mode dashboard
- Top-down course map with:
  - drone marker + heading
  - gate numbering and status (pending/target/passed)
  - planned trajectory and actual path
  - hover tooltip metadata (gate id, status, confidence, pass time)
  - zoom + pan
- Secondary perspective (pseudo-3D) panel
- Live telemetry cards
- Mission phase + progress panel
- System health status cards
- Event/decision timeline with timestamps
- Controls:
  - start
  - pause/resume
  - reset
  - speed multiplier
  - preset switching (`easy`, `medium`, `noisy`)
  - layer toggles
  - step-gate action
- Trend mini-charts for speed and confidence

## State flow

1. `MissionSimulator` (`ui/state/missionSimulator.js`) owns mission state and emits snapshots.
2. `main.js` subscribes to snapshots and updates all visual components.
3. Components are read-only renderers over snapshot data:
   - `CourseMap`
   - `PerspectiveView`
   - `TelemetryPanel`
   - `MissionStatusCard`
   - `HealthStatusGrid`
   - `EventTimeline`
   - `TrendCharts`
4. `ControlBar` dispatches user actions back to simulator methods.

The state shape mirrors a future telemetry stream:

- `drone`
- `gates`
- `trajectory`
- `actual_path`
- `mission_state` / `mission_phase`
- `system_health`
- `event_log`
- `telemetry`

## Run

From repo root, serve static files and open the UI:

```powershell
cd C:\Users\Vnm4\Downloads\Drone
python -m http.server 8080
```

Then open:

- http://127.0.0.1:8080/ui/

## Customize

- Edit course presets in `ui/data/presets.js`
- Tune mission behavior in `ui/state/missionSimulator.js`
- Adjust visuals in `ui/styles.css`
