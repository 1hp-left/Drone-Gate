import { ControlBar } from "./components/controlBar.js";
import { CourseMap } from "./components/courseMap.js";
import { EventTimeline } from "./components/eventTimeline.js";
import { HealthStatusGrid } from "./components/healthStatusGrid.js";
import { MissionStatusCard } from "./components/missionStatusCard.js";
import { PerspectiveView } from "./components/perspectiveView.js";
import { TelemetryPanel } from "./components/telemetryPanel.js";
import { TrendCharts } from "./components/trendCharts.js";
import { MissionSimulator } from "./state/missionSimulator.js";

const simulator = new MissionSimulator();

const map = new CourseMap(
  document.getElementById("course-map-canvas"),
  document.getElementById("gate-tooltip")
);
const perspectiveView = new PerspectiveView(document.getElementById("perspective-canvas"));
const telemetryPanel = new TelemetryPanel(document.getElementById("telemetry-panel"));
const missionCard = new MissionStatusCard(document.getElementById("mission-card"));
const healthGrid = new HealthStatusGrid(document.getElementById("health-grid"));
const eventTimeline = new EventTimeline(document.getElementById("event-log"));
const trends = new TrendCharts(
  document.getElementById("speed-trend-canvas"),
  document.getElementById("confidence-trend-canvas")
);

const controlBar = new ControlBar(document.getElementById("control-bar"), {
  onStart: () => simulator.start(),
  onPauseResume: () => simulator.pauseResume(),
  onReset: () => {
    trends.reset();
    simulator.reset();
    simulator.emit();
  },
  onStepGate: () => simulator.stepGate(),
  onPreset: (preset) => {
    trends.reset();
    simulator.setPreset(preset);
    simulator.emit();
  },
  onSpeed: (speed) => simulator.setSpeed(speed),
  onToggles: (flags) => map.setFlags(flags),
});

const warningBanner = document.getElementById("warning-banner");

let hasFit = false;
simulator.onUpdate((state) => {
  if (!hasFit) {
    map.fitToCourse(state);
    hasFit = true;
  }

  const warn = state.mission_phase === "Fail-safe / Hover" || state.system_health.overall !== "healthy";
  warningBanner.style.display = warn ? "block" : "none";
  warningBanner.textContent =
    state.mission_phase === "Fail-safe / Hover"
      ? "Warning: Confidence dropped. Recovery / hover behavior active."
      : state.system_health.overall === "warning"
      ? "Warning: System health degraded."
      : "Critical: Immediate operator attention required.";

  map.render(state);
  perspectiveView.render(state);
  telemetryPanel.render(state);
  missionCard.render(state);
  healthGrid.render(state);
  eventTimeline.render(state);
  controlBar.sync(state);
  trends.render(state);
});

let last = performance.now();
function tick(now) {
  const dt = (now - last) / 1000;
  last = now;
  simulator.update(Math.min(dt, 0.05));
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
