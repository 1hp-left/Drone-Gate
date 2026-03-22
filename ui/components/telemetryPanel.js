function fmt(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

export class TelemetryPanel {
  constructor(root) {
    this.root = root;
  }

  render(state) {
    const t = state.telemetry;
    this.root.innerHTML = `
      <div class="telemetry-grid">
        <div class="metric-card"><span>Speed</span><strong>${fmt(t.speed, 2)} m/s</strong></div>
        <div class="metric-card"><span>Altitude</span><strong>${fmt(t.altitude, 2)} m</strong></div>
        <div class="metric-card"><span>Heading / Yaw</span><strong>${fmt(t.heading, 1)}°</strong></div>
        <div class="metric-card"><span>Distance to Gate</span><strong>${fmt(t.distanceToNextGate, 2)} m</strong></div>
        <div class="metric-card"><span>Mission Phase</span><strong>${state.mission_phase}</strong></div>
        <div class="metric-card"><span>Autonomy Mode</span><strong>${state.autonomy_mode}</strong></div>
        <div class="metric-card"><span>Detection Confidence</span><strong>${fmt(t.gateDetectionConfidence * 100, 0)}%</strong></div>
        <div class="metric-card"><span>Battery</span><strong>${fmt(t.battery, 1)}%</strong></div>
        <div class="metric-card"><span>Latency</span><strong>${fmt(t.latency, 1)} ms</strong></div>
        <div class="metric-card"><span>Loop Time</span><strong>${fmt(t.loopTimeMs, 1)} ms</strong></div>
      </div>
    `;
  }
}
