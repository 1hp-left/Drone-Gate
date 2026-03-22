const LABELS = {
  perception: "Perception",
  planner: "Planner",
  controller: "Controller",
  localization: "Localization",
  overall: "Overall",
};

export class HealthStatusGrid {
  constructor(root) {
    this.root = root;
  }

  render(state) {
    const cards = Object.entries(state.system_health)
      .map(
        ([key, value]) => `
          <div class="health-card ${value}">
            <span>${LABELS[key] ?? key}</span>
            <strong>${value}</strong>
          </div>
        `
      )
      .join("");

    this.root.innerHTML = `<div class="health-grid">${cards}</div>`;
  }
}
