function worldToScreen(point, view) {
  return {
    x: view.cx + (point.x + view.offsetX) * view.scale,
    y: view.cy - (point.y + view.offsetY) * view.scale,
  };
}

function drawGate(ctx, gate, view, showLabels) {
  const p = worldToScreen(gate, view);
  const width = Math.max(18, gate.width * view.scale);
  const height = Math.max(14, gate.height * view.scale * 0.6);

  let color = "#64748b";
  if (gate.status === "passed") color = "#16a34a";
  if (gate.status === "target") color = "#f97316";

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = gate.status === "target" ? 3 : 2;
  ctx.fillStyle = gate.status === "passed" ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.06)";
  ctx.fillRect(-width / 2, -height / 2, width, height);
  ctx.strokeRect(-width / 2, -height / 2, width, height);

  if (showLabels) {
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "12px Inter, Segoe UI, sans-serif";
    ctx.fillText(`#${gate.id}`, -8, -height / 2 - 8);
  }
  ctx.restore();
}

function drawPath(ctx, points, view, color, width = 2, dashed = false) {
  if (!points?.length) return;
  ctx.save();
  ctx.beginPath();
  const first = worldToScreen(points[0], view);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const p = worldToScreen(points[i], view);
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dashed) ctx.setLineDash([8, 6]);
  ctx.stroke();
  ctx.restore();
}

function drawDrone(ctx, drone, view) {
  const p = worldToScreen(drone, view);
  const size = 11;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(-drone.heading);

  ctx.fillStyle = "#38bdf8";
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.8, size * 0.65);
  ctx.lineTo(-size * 0.4, 0);
  ctx.lineTo(-size * 0.8, -size * 0.65);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

export class CourseMap {
  constructor(canvas, tooltip) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.tooltip = tooltip;

    this.view = {
      scale: 14,
      offsetX: 0,
      offsetY: 0,
      cx: 0,
      cy: 0,
    };

    this.flags = {
      plannedPath: true,
      actualPath: true,
      labels: true,
      overlays: true,
    };

    this.dragging = false;
    this.lastMouse = null;
    this.lastState = null;

    this.bindEvents();
    this.resize();
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());

    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? 0.92 : 1.08;
      this.view.scale = Math.max(6, Math.min(56, this.view.scale * delta));
      if (this.lastState) this.render(this.lastState);
    });

    this.canvas.addEventListener("mousedown", (event) => {
      this.dragging = true;
      this.lastMouse = { x: event.clientX, y: event.clientY };
    });

    window.addEventListener("mouseup", () => {
      this.dragging = false;
    });

    window.addEventListener("mousemove", (event) => {
      if (this.dragging && this.lastMouse) {
        const dx = event.clientX - this.lastMouse.x;
        const dy = event.clientY - this.lastMouse.y;
        this.view.offsetX += dx / this.view.scale;
        this.view.offsetY -= dy / this.view.scale;
        this.lastMouse = { x: event.clientX, y: event.clientY };
        if (this.lastState) this.render(this.lastState);
        return;
      }
      this.handleHover(event);
    });
  }

  handleHover(event) {
    if (!this.lastState?.gates?.length) {
      this.tooltip.style.display = "none";
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const hovered = this.lastState.gates.find((gate) => {
      const p = worldToScreen(gate, this.view);
      return Math.hypot(p.x - x, p.y - y) < 16;
    });

    if (!hovered) {
      this.tooltip.style.display = "none";
      return;
    }

    this.tooltip.style.display = "block";
    this.tooltip.style.left = `${event.clientX + 12}px`;
    this.tooltip.style.top = `${event.clientY + 12}px`;
    this.tooltip.innerHTML = `
      <div><strong>Gate #${hovered.id}</strong></div>
      <div>Status: ${hovered.status}</div>
      <div>Pos: (${hovered.x.toFixed(1)}, ${hovered.y.toFixed(1)}, ${hovered.z.toFixed(1)})</div>
      <div>Conf: ${(hovered.confidence * 100).toFixed(0)}%</div>
      <div>Pass time: ${hovered.passTime ? `${hovered.passTime.toFixed(1)}s` : "--"}</div>
    `;
  }

  setFlags(flags) {
    this.flags = { ...this.flags, ...flags };
    if (this.lastState) this.render(this.lastState);
  }

  fitToCourse(state) {
    const points = [...state.gates, state.drone];
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const width = Math.max(8, Math.max(...xs) - Math.min(...xs));
    const height = Math.max(8, Math.max(...ys) - Math.min(...ys));

    const margin = 0.75;
    const sx = this.canvas.width / (width * (1 + margin));
    const sy = this.canvas.height / (height * (1 + margin));
    this.view.scale = Math.max(7, Math.min(24, Math.min(sx, sy)));

    const centerX = (Math.max(...xs) + Math.min(...xs)) / 2;
    const centerY = (Math.max(...ys) + Math.min(...ys)) / 2;
    this.view.offsetX = -centerX;
    this.view.offsetY = -centerY;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * window.devicePixelRatio);
    this.canvas.height = Math.floor(rect.height * window.devicePixelRatio);
    this.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    this.view.cx = rect.width / 2;
    this.view.cy = rect.height / 2;
    if (this.lastState) this.render(this.lastState);
  }

  render(state) {
    this.lastState = state;
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
    ctx.lineWidth = 1;
    for (let x = 0; x < rect.width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
    for (let y = 0; y < rect.height; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }

    if (this.flags.plannedPath) {
      drawPath(ctx, state.trajectory, this.view, "rgba(251,191,36,0.9)", 2.1, true);
    }
    if (this.flags.actualPath) {
      drawPath(ctx, state.actual_path, this.view, "rgba(59,130,246,0.95)", 2.5, false);
    }

    state.gates.forEach((gate) => drawGate(ctx, gate, this.view, this.flags.labels));
    drawDrone(ctx, state.drone, this.view);

    if (this.flags.overlays) {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "12px Inter, Segoe UI, sans-serif";
      ctx.fillText(`Scale ${this.view.scale.toFixed(1)} px/m`, 14, 20);
      ctx.fillText(`Pan ${this.view.offsetX.toFixed(1)}, ${this.view.offsetY.toFixed(1)}`, 14, 38);
    }
  }
}
