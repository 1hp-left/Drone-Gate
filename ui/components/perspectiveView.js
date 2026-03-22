function project(point, width, height, camera) {
  const relX = point.x - camera.x;
  const relY = point.y - camera.y;
  const relZ = point.z - camera.z;
  const depth = Math.max(1.2, relX * 0.8 + 7.5);
  return {
    x: width * 0.52 + (relY * 54) / depth,
    y: height * 0.72 - (relZ * 150) / depth,
    scale: 1 / depth,
  };
}

export class PerspectiveView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.lastState = null;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * window.devicePixelRatio);
    this.canvas.height = Math.floor(rect.height * window.devicePixelRatio);
    this.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    if (this.lastState) this.render(this.lastState);
  }

  render(state) {
    this.lastState = state;
    const rect = this.canvas.getBoundingClientRect();
    const ctx = this.ctx;
    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#111827");
    gradient.addColorStop(1, "#020617");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(148,163,184,0.25)";
    for (let i = 0; i < 8; i += 1) {
      const y = height * 0.35 + i * ((height * 0.55) / 8);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const camera = {
      x: state.drone.x - 6,
      y: state.drone.y,
      z: state.drone.z + 1.2,
    };

    const sortedGates = [...state.gates].sort((a, b) => b.x - a.x);
    sortedGates.forEach((gate) => {
      const p = project(gate, width, height, camera);
      const gateWidth = Math.max(12, (gate.width * 180) * p.scale);
      const gateHeight = Math.max(10, (gate.height * 180) * p.scale);

      let color = "#475569";
      if (gate.status === "passed") color = "#16a34a";
      if (gate.status === "target") color = "#f97316";

      ctx.strokeStyle = color;
      ctx.lineWidth = gate.status === "target" ? 3 : 2;
      ctx.fillStyle = "rgba(15,23,42,0.36)";
      ctx.fillRect(p.x - gateWidth / 2, p.y - gateHeight / 2, gateWidth, gateHeight);
      ctx.strokeRect(p.x - gateWidth / 2, p.y - gateHeight / 2, gateWidth, gateHeight);
    });

    const droneP = project(state.drone, width, height, camera);
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(droneP.x, droneP.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f8fafc";
    ctx.stroke();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px Inter, Segoe UI, sans-serif";
    ctx.fillText("Pseudo-3D Approach View", 14, 20);
  }
}
