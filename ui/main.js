const state = {
  running: false,
  t: 0,
  gateIndex: 0,
  gatesTotal: 6,
  speed: 0,
  altitude: 0,
  yaw: 0,
  fps: 0,
  phase: "idle",
  path: [],
  lastFrameTs: performance.now(),
  frameCount: 0,
  preset: "easy",
};

const presets = {
  easy: { noise: 0.3, speed: 2.2 },
  medium: { noise: 0.9, speed: 2.8 },
  noisy: { noise: 1.5, speed: 3.2 },
};

const els = {
  runStatus: document.getElementById("runStatus"),
  phase: document.getElementById("phase"),
  gate: document.getElementById("gate"),
  speed: document.getElementById("speed"),
  altitude: document.getElementById("altitude"),
  yaw: document.getElementById("yaw"),
  fps: document.getElementById("fps"),
  events: document.getElementById("events"),
  startBtn: document.getElementById("startBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  resetBtn: document.getElementById("resetBtn"),
  preset: document.getElementById("presetSelect"),
  canvas: document.getElementById("courseCanvas"),
};

const ctx = els.canvas.getContext("2d");
const gates = [
  { x: 120, y: 130 },
  { x: 220, y: 250 },
  { x: 360, y: 110 },
  { x: 500, y: 300 },
  { x: 660, y: 160 },
  { x: 790, y: 260 },
];

function addEvent(text) {
  const li = document.createElement("li");
  li.textContent = `${new Date().toLocaleTimeString()} — ${text}`;
  els.events.prepend(li);
  while (els.events.children.length > 30) {
    els.events.removeChild(els.events.lastChild);
  }
}

function setRunning(running) {
  state.running = running;
  els.runStatus.textContent = running ? "RUNNING" : "IDLE";
  els.runStatus.classList.toggle("running", running);
  els.startBtn.disabled = running;
  els.pauseBtn.disabled = !running;
}

function resetMission() {
  state.t = 0;
  state.gateIndex = 0;
  state.speed = 0;
  state.altitude = 0;
  state.yaw = 0;
  state.phase = "idle";
  state.path = [{ x: 70, y: 210 }];
  setRunning(false);
  addEvent("Mission reset");
  render();
}

function startMission() {
  if (state.running) return;
  state.phase = "takeoff";
  setRunning(true);
  addEvent(`Mission started (${state.preset})`);
}

function update(dt) {
  if (!state.running) return;
  const cfg = presets[state.preset];
  state.t += dt;

  if (state.t < 1.8) {
    state.phase = "takeoff";
    state.altitude = Math.min(2.3, state.altitude + dt * 1.4);
    state.speed = 0.8;
  } else {
    state.phase = "navigate";
    state.speed = cfg.speed + Math.sin(state.t * 1.2) * 0.25;
    state.yaw = (Math.sin(state.t * 0.6) * 28) + (Math.random() - 0.5) * cfg.noise;

    const last = state.path[state.path.length - 1];
    const target = gates[Math.min(state.gateIndex, gates.length - 1)];
    const dx = target.x - last.x;
    const dy = target.y - last.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = Math.max(0.6, state.speed * 18 * dt);

    const nx = last.x + (dx / dist) * step + (Math.random() - 0.5) * cfg.noise;
    const ny = last.y + (dy / dist) * step + (Math.random() - 0.5) * cfg.noise;
    state.path.push({ x: nx, y: ny });

    if (dist < 18 && state.gateIndex < state.gatesTotal) {
      state.gateIndex += 1;
      addEvent(`Gate ${state.gateIndex}/${state.gatesTotal} crossed`);
      if (state.gateIndex >= state.gatesTotal) {
        state.phase = "complete";
        setRunning(false);
        addEvent("Mission completed successfully");
      }
    }
  }
}

function renderTelemetry() {
  els.phase.textContent = state.phase;
  els.gate.textContent = `${state.gateIndex} / ${state.gatesTotal}`;
  els.speed.textContent = `${state.speed.toFixed(2)} m/s`;
  els.altitude.textContent = `${state.altitude.toFixed(2)} m`;
  els.yaw.textContent = `${state.yaw.toFixed(1)}°`;
  els.fps.textContent = `${state.fps}`;
}

function drawMap() {
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);

  ctx.fillStyle = "#0a1226";
  ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);

  for (let i = 0; i < gates.length; i += 1) {
    const gate = gates[i];
    ctx.strokeStyle = i < state.gateIndex ? "#42d392" : "#5aa6ff";
    ctx.lineWidth = 3;
    ctx.strokeRect(gate.x - 14, gate.y - 26, 28, 52);
    ctx.fillStyle = "#9eb0dd";
    ctx.font = "12px Segoe UI";
    ctx.fillText(`G${i + 1}`, gate.x - 10, gate.y - 32);
  }

  if (state.path.length > 1) {
    ctx.beginPath();
    ctx.moveTo(state.path[0].x, state.path[0].y);
    for (const p of state.path) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "#ffca57";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const p = state.path[state.path.length - 1];
  if (p) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
}

function render() {
  renderTelemetry();
  drawMap();
}

function loop(now) {
  const dt = Math.min(0.05, (now - state.lastFrameTs) / 1000);
  state.lastFrameTs = now;
  state.frameCount += 1;

  if (state.frameCount % 12 === 0) {
    state.fps = Math.round(1 / Math.max(dt, 1e-3));
  }

  update(dt);
  render();
  requestAnimationFrame(loop);
}

els.startBtn.addEventListener("click", startMission);
els.pauseBtn.addEventListener("click", () => {
  if (!state.running) return;
  setRunning(false);
  state.phase = "paused";
  addEvent("Mission paused");
  renderTelemetry();
});
els.resetBtn.addEventListener("click", resetMission);
els.preset.addEventListener("change", (e) => {
  state.preset = e.target.value;
  addEvent(`Preset switched to ${state.preset}`);
});

resetMission();
requestAnimationFrame(loop);
