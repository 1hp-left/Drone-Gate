import { COURSE_PRESETS } from "../data/presets.js";

export class ControlBar {
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.renderShell();
    this.bind();
  }

  renderShell() {
    const presetOptions = Object.keys(COURSE_PRESETS)
      .map((key) => `<option value="${key}">${COURSE_PRESETS[key].name}</option>`)
      .join("");

    this.root.innerHTML = `
      <div class="control-group">
        <button id="btn-start" class="btn primary">Start Mission</button>
        <button id="btn-pause" class="btn">Pause / Resume</button>
        <button id="btn-reset" class="btn">Reset Course</button>
        <button id="btn-step" class="btn">Step Gate</button>
      </div>
      <div class="control-group">
        <label>Preset
          <select id="preset-select">${presetOptions}</select>
        </label>
        <label>Speed
          <input id="speed-range" type="range" min="0.25" max="4" value="1" step="0.25" />
        </label>
        <span id="speed-label">1.00x</span>
      </div>
      <div class="control-group toggles">
        <label><input id="toggle-planned" type="checkbox" checked /> Planned Path</label>
        <label><input id="toggle-actual" type="checkbox" checked /> Actual Path</label>
        <label><input id="toggle-labels" type="checkbox" checked /> Labels</label>
        <label><input id="toggle-overlays" type="checkbox" checked /> Telemetry Overlays</label>
      </div>
    `;
  }

  bind() {
    this.root.querySelector("#btn-start").addEventListener("click", () => this.handlers.onStart());
    this.root.querySelector("#btn-pause").addEventListener("click", () => this.handlers.onPauseResume());
    this.root.querySelector("#btn-reset").addEventListener("click", () => this.handlers.onReset());
    this.root.querySelector("#btn-step").addEventListener("click", () => this.handlers.onStepGate());

    this.root.querySelector("#preset-select").addEventListener("change", (event) => {
      this.handlers.onPreset(event.target.value);
    });

    this.root.querySelector("#speed-range").addEventListener("input", (event) => {
      const value = Number(event.target.value);
      this.root.querySelector("#speed-label").textContent = `${value.toFixed(2)}x`;
      this.handlers.onSpeed(value);
    });

    this.root.querySelector("#toggle-planned").addEventListener("change", (event) => {
      this.handlers.onToggles({ plannedPath: event.target.checked });
    });

    this.root.querySelector("#toggle-actual").addEventListener("change", (event) => {
      this.handlers.onToggles({ actualPath: event.target.checked });
    });

    this.root.querySelector("#toggle-labels").addEventListener("change", (event) => {
      this.handlers.onToggles({ labels: event.target.checked });
    });

    this.root.querySelector("#toggle-overlays").addEventListener("change", (event) => {
      this.handlers.onToggles({ overlays: event.target.checked });
    });
  }

  sync(state) {
    const select = this.root.querySelector("#preset-select");
    if (select.value !== state.ui.selectedPreset) {
      select.value = state.ui.selectedPreset;
    }
    this.root.querySelector("#speed-label").textContent = `${state.sim.speed.toFixed(2)}x`;
    this.root.querySelector("#speed-range").value = String(state.sim.speed);
  }
}
