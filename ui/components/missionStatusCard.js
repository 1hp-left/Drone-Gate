export class MissionStatusCard {
  constructor(root) {
    this.root = root;
  }

  render(state) {
    const pct = state.progress.total ? Math.round((state.progress.completed / state.progress.total) * 100) : 0;

    this.root.innerHTML = `
      <div class="mission-phase">${state.mission_phase}</div>
      <div class="progress-meta">${state.progress.completed} / ${state.progress.total} gates completed</div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="status-row">
        <span>Mission State</span>
        <strong class="status-pill ${state.mission_state}">${state.mission_state}</strong>
      </div>
      <div class="status-row">
        <span>Simulation Time</span>
        <strong>${state.sim.simTime.toFixed(1)}s</strong>
      </div>
      <div class="status-row">
        <span>Speed Multiplier</span>
        <strong>${state.sim.speed.toFixed(2)}x</strong>
      </div>
    `;
  }
}
