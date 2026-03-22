const worldScale = 0.038;

const state = {
  running: false,
  t: 0,
  gateIndex: 0,
  gatesTotal: 3,
  speed: 0,
  altitude: 0,
  yawDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  fps: 0,
  phase: "idle",
  path: [],
  plannedPath: [],
  velocity: { x: 0, y: 0 },
  verticalSpeed: 0,
  missionStartTs: 0,
  elapsedSeconds: 0,
  lastFrameTs: performance.now(),
  frameCount: 0,
  preset: "easy",
  levelMode: "normal",
  thinking: {
    distanceError: 0,
    headingErrorDeg: 0,
    yawCommandDeg: 0,
    pitchCommandDeg: 0,
    riskScore: 0,
    note: "Awaiting mission start.",
  },
};

const camera = {
  orbitYaw: Math.PI * 0.38,
  orbitPitch: 0.45,
  distance: 22,
  panX: 0,
  panY: 2,
  dragging: false,
  dragMode: "rotate",
  lastX: 0,
  lastY: 0,
};

const presets = {
  easy: { noise: 0.2, speed: 2.35, stability: 1.25, clearanceBias: 1.0 },
  medium: { noise: 0.75, speed: 2.85, stability: 1.0, clearanceBias: 0.94 },
  noisy: { noise: 1.3, speed: 3.25, stability: 0.82, clearanceBias: 0.88 },
};

const els = {
  runStatus: document.getElementById("runStatus"),
  missionClock: document.getElementById("missionClock"),
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
  levelMode: document.getElementById("levelModeSelect"),
  generateLevelBtn: document.getElementById("generateLevelBtn"),
  mapCanvas: document.getElementById("courseCanvas"),
  flightCanvas: document.getElementById("flightCanvas"),
  thinkTarget: document.getElementById("thinkTarget"),
  thinkDistance: document.getElementById("thinkDistance"),
  thinkHeading: document.getElementById("thinkHeading"),
  thinkPitch: document.getElementById("thinkPitch"),
  thinkYawCmd: document.getElementById("thinkYawCmd"),
  thinkRisk: document.getElementById("thinkRisk"),
  thinkNote: document.getElementById("thinkNote"),
};

const mapCtx = els.mapCanvas.getContext("2d");
const viewCtx = els.flightCanvas.getContext("2d");

const normalGates = [
  { x: 220, y: 120 },
  { x: 460, y: 300 },
  { x: 730, y: 185 },
];

let gates = normalGates.map((gate) => ({ ...gate }));

const startPoint = { x: 70, y: 210 };

function setGates(nextGates) {
  gates = nextGates.map((gate) => ({ ...gate }));
  state.gatesTotal = gates.length;
}

function generateProceduralGates() {
  const gateCount = Math.floor(Math.random() * 4) + 4;
  const generated = [];
  const minGap = 90;

  for (let index = 0; index < gateCount; index += 1) {
    let candidate;
    let attempts = 0;
    do {
      const laneProgress = (index + 1) / (gateCount + 1);
      candidate = {
        x: 130 + laneProgress * (els.mapCanvas.width - 250) + (Math.random() - 0.5) * 40,
        y: 70 + Math.random() * (els.mapCanvas.height - 140),
      };
      attempts += 1;
    } while (
      generated.some((existing) => Math.hypot(existing.x - candidate.x, existing.y - candidate.y) < minGap)
      && attempts < 80
    );

    generated.push(candidate);
  }

  return generated;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

function radiansToDegrees(value) {
  return (value * 180) / Math.PI;
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function normalizeAngle(angle) {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

function mapToWorld(point, altitude = 0) {
  const cx = els.mapCanvas.width * 0.5;
  const cy = els.mapCanvas.height * 0.5;
  return {
    x: (point.x - cx) * worldScale,
    y: altitude,
    z: (point.y - cy) * worldScale,
  };
}

function addEvent(text) {
  const li = document.createElement("li");
  li.textContent = `${new Date().toLocaleTimeString([], { hour12: false })} — ${text}`;
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

  if (running && state.missionStartTs === 0) {
    state.missionStartTs = performance.now() - state.elapsedSeconds * 1000;
  }
}

function buildPlannedPath() {
  const points = [startPoint, ...gates];
  const sampled = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    sampled.push({ x: current.x, y: current.y });

    for (let step = 1; step <= 10; step += 1) {
      const t = step / 10;
      sampled.push({
        x: lerp(current.x, next.x, t),
        y: lerp(current.y, next.y, t),
      });
    }
  }

  return sampled;
}

function resetMission() {
  state.t = 0;
  state.gateIndex = 0;
  state.speed = 0;
  state.altitude = 0;
  state.yawDeg = 0;
  state.pitchDeg = 0;
  state.rollDeg = 0;
  state.velocity = { x: 0, y: 0 };
  state.verticalSpeed = 0;
  state.phase = "idle";
  state.missionStartTs = 0;
  state.elapsedSeconds = 0;
  if (state.levelMode === "normal") {
    setGates(normalGates);
  }
  state.path = [{ ...startPoint }];
  state.plannedPath = buildPlannedPath();
  state.thinking = {
    distanceError: 0,
    headingErrorDeg: 0,
    yawCommandDeg: 0,
    pitchCommandDeg: 0,
    riskScore: 0,
    note: "Awaiting mission start.",
  };
  setRunning(false);
  addEvent(`Mission reset (${state.levelMode})`);
  render();
}

function startMission() {
  if (state.running) return;
  if (state.phase === "complete") {
    resetMission();
  }
  state.phase = "takeoff";
  setRunning(true);
  addEvent(`Mission started (${state.preset}, ${state.levelMode})`);
}

function updateThinking(target, distanceError, headingError, yawCmd, pitchCmd, riskScore) {
  state.thinking.distanceError = distanceError;
  state.thinking.headingErrorDeg = radiansToDegrees(headingError);
  state.thinking.yawCommandDeg = radiansToDegrees(yawCmd);
  state.thinking.pitchCommandDeg = radiansToDegrees(pitchCmd);
  state.thinking.riskScore = riskScore;

  if (!state.running && state.phase !== "complete") {
    state.thinking.note = "Awaiting mission start.";
    return;
  }

  if (state.phase === "takeoff") {
    state.thinking.note = "Takeoff controller is increasing throttle to reach mission altitude setpoint.";
    return;
  }

  const targetLabel = `G${Math.min(state.gateIndex + 1, gates.length)}`;
  const turnText = Math.abs(state.thinking.headingErrorDeg) > 7 ? "applying turn correction" : "heading aligned";
  const riskText = riskScore > 0.65 ? "higher risk, reducing stability margin" : "stable corridor";
  state.thinking.note = `Planner targets ${targetLabel}; ${turnText}; ${riskText}.`;

  if (state.phase === "complete") {
    state.thinking.note = "All gates completed. Holding mission end state.";
  }
}

function update(dt) {
  if (!state.running) return;

  const cfg = presets[state.preset];
  state.t += dt;
  state.elapsedSeconds = (performance.now() - state.missionStartTs) / 1000;

  const last = state.path[state.path.length - 1];
  const target = gates[Math.min(state.gateIndex, gates.length - 1)];
  const dx = target.x - last.x;
  const dy = target.y - last.y;
  const distanceError = Math.hypot(dx, dy);

  const desiredHeading = Math.atan2(dy, dx);
  const currentHeading = degreesToRadians(state.yawDeg);
  const headingError = normalizeAngle(desiredHeading - currentHeading);

  const yawCommand = clamp(headingError * 1.18, -degreesToRadians(80), degreesToRadians(80));
  const pitchCommand = clamp(-distanceError * 0.0024, -degreesToRadians(22), degreesToRadians(22));

  const clearanceRisk = clamp(Math.abs(headingError) / degreesToRadians(70), 0, 1);
  const distanceRisk = clamp(distanceError / 260, 0, 1);
  const riskScore = clamp(clearanceRisk * 0.58 + distanceRisk * 0.42, 0, 1);

  if (state.t < 1.7) {
    state.phase = "takeoff";
    const prevAlt = state.altitude;
    state.altitude = Math.min(2.8, state.altitude + dt * 1.6);
    state.verticalSpeed = (state.altitude - prevAlt) / Math.max(dt, 1e-3);
    state.speed = 0.9;
    state.pitchDeg = lerp(state.pitchDeg, -8, 0.08);
    state.rollDeg = lerp(state.rollDeg, 0, 0.1);
  } else {
    state.phase = "navigate";

    state.speed = cfg.speed + Math.sin(state.t * 1.1) * 0.22;
    state.yawDeg = radiansToDegrees(normalizeAngle(currentHeading + yawCommand * dt * 2.2));

    const travel = Math.max(0.6, state.speed * 17 * dt * cfg.stability);
    const nx = last.x + Math.cos(desiredHeading) * travel + (Math.random() - 0.5) * cfg.noise;
    const ny = last.y + Math.sin(desiredHeading) * travel + (Math.random() - 0.5) * cfg.noise;

    const prevAlt = state.altitude;
    state.altitude = 2.35 + Math.sin(state.t * 0.86) * 0.18;
    state.verticalSpeed = (state.altitude - prevAlt) / Math.max(dt, 1e-3);

    state.velocity = { x: nx - last.x, y: ny - last.y };
    state.path.push({ x: nx, y: ny });

    if (state.path.length > 2600) {
      state.path.shift();
    }

    const horizontalSpeed = Math.max(travel / Math.max(dt, 1e-3), 0.1);
    const truePitch = Math.atan2(state.verticalSpeed, horizontalSpeed * 0.42);
    state.pitchDeg = clamp(radiansToDegrees(truePitch), -24, 24);

    const yawRate = radiansToDegrees(yawCommand);
    state.rollDeg = clamp(-yawRate * 0.12, -26, 26);

    if (distanceError < 18 * cfg.clearanceBias && state.gateIndex < state.gatesTotal) {
      state.gateIndex += 1;
      addEvent(`Gate ${state.gateIndex}/${state.gatesTotal} crossed`);

      if (state.gateIndex >= state.gatesTotal) {
        state.phase = "complete";
        setRunning(false);
        state.elapsedSeconds = (performance.now() - state.missionStartTs) / 1000;
        updateThinking(target, 0, 0, 0, 0, 0);
        state.thinking.note = "Mission complete. Controller settled to neutral attitude.";
        addEvent("Mission completed successfully");
      }
    }
  }

  updateThinking(target, distanceError, headingError, yawCommand, pitchCommand, riskScore);
}

function renderTelemetry() {
  els.phase.textContent = state.phase;
  els.gate.textContent = `${state.gateIndex} / ${state.gatesTotal}`;
  els.speed.textContent = `${state.speed.toFixed(2)} m/s`;
  els.altitude.textContent = `${state.altitude.toFixed(2)} m`;
  els.yaw.textContent = `${state.yawDeg.toFixed(1)}°`;
  els.fps.textContent = `${state.fps}`;
  els.missionClock.textContent = formatTime(state.elapsedSeconds);

  const activeTarget = Math.min(state.gateIndex + 1, gates.length);
  els.thinkTarget.textContent = gates.length > 0 ? `G${activeTarget}` : "—";
  els.thinkDistance.textContent = `${state.thinking.distanceError.toFixed(2)} m`;
  els.thinkHeading.textContent = `${state.thinking.headingErrorDeg.toFixed(1)}°`;
  els.thinkPitch.textContent = `${state.thinking.pitchCommandDeg.toFixed(1)}°`;
  els.thinkYawCmd.textContent = `${state.thinking.yawCommandDeg.toFixed(1)}°`;
  els.thinkRisk.textContent = `${state.thinking.riskScore.toFixed(2)}`;
  els.thinkNote.textContent = state.thinking.note;
}

function drawMapGrid() {
  mapCtx.strokeStyle = "rgba(120, 154, 232, 0.16)";
  mapCtx.lineWidth = 1;

  for (let x = 0; x <= els.mapCanvas.width; x += 45) {
    mapCtx.beginPath();
    mapCtx.moveTo(x, 0);
    mapCtx.lineTo(x, els.mapCanvas.height);
    mapCtx.stroke();
  }
  for (let y = 0; y <= els.mapCanvas.height; y += 45) {
    mapCtx.beginPath();
    mapCtx.moveTo(0, y);
    mapCtx.lineTo(els.mapCanvas.width, y);
    mapCtx.stroke();
  }
}

function drawPolyline(context, points, color, width, dash = []) {
  if (!points || points.length < 2) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points) {
    context.lineTo(point.x, point.y);
  }
  context.strokeStyle = color;
  context.lineWidth = width;
  context.setLineDash(dash);
  context.stroke();
  context.setLineDash([]);
}

function drawMap() {
  mapCtx.clearRect(0, 0, els.mapCanvas.width, els.mapCanvas.height);
  mapCtx.fillStyle = "#081126";
  mapCtx.fillRect(0, 0, els.mapCanvas.width, els.mapCanvas.height);

  drawMapGrid();

  drawPolyline(mapCtx, state.plannedPath, "#22d3ee", 2.2, [6, 5]);
  drawPolyline(mapCtx, state.path, "#fbbf24", 2.6);

  for (let index = 0; index < gates.length; index += 1) {
    const gate = gates[index];
    mapCtx.strokeStyle = index < state.gateIndex ? "#34d399" : "#60a5fa";
    mapCtx.lineWidth = 3;
    mapCtx.strokeRect(gate.x - 14, gate.y - 26, 28, 52);
    mapCtx.fillStyle = "#9fb3de";
    mapCtx.font = "12px Segoe UI";
    mapCtx.fillText(`G${index + 1}`, gate.x - 10, gate.y - 32);
  }

  const p = state.path[state.path.length - 1];
  if (!p) return;

  mapCtx.beginPath();
  mapCtx.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
  mapCtx.fillStyle = "#ffffff";
  mapCtx.fill();

  mapCtx.beginPath();
  mapCtx.arc(p.x, p.y, 11, 0, Math.PI * 2);
  mapCtx.strokeStyle = "rgba(255,255,255,0.45)";
  mapCtx.lineWidth = 1.2;
  mapCtx.stroke();
}

function vecAdd(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vecSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vecScale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function vecDot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vecCross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function vecLength(v) {
  return Math.hypot(v.x, v.y, v.z);
}

function vecNormalize(v) {
  const len = vecLength(v) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function rotateLocalPoint(point, yawRad, pitchRad, rollRad) {
  const cy = Math.cos(yawRad);
  const sy = Math.sin(yawRad);
  const cp = Math.cos(pitchRad);
  const sp = Math.sin(pitchRad);
  const cr = Math.cos(rollRad);
  const sr = Math.sin(rollRad);

  let x = point.x;
  let y = point.y;
  let z = point.z;

  const x1 = cy * x - sy * z;
  const z1 = sy * x + cy * z;
  x = x1;
  z = z1;

  const y2 = cp * y - sp * z;
  const z2 = sp * y + cp * z;
  y = y2;
  z = z2;

  const x3 = cr * x - sr * y;
  const y3 = sr * x + cr * y;

  return { x: x3, y: y3, z };
}

function getCameraVectors(target) {
  const cp = Math.cos(camera.orbitPitch);
  const cameraPos = {
    x: target.x + camera.panX + Math.cos(camera.orbitYaw) * cp * camera.distance,
    y: target.y + camera.panY + Math.sin(camera.orbitPitch) * camera.distance,
    z: target.z + Math.sin(camera.orbitYaw) * cp * camera.distance,
  };

  const forward = vecNormalize(vecSub(target, cameraPos));
  const upApprox = { x: 0, y: 1, z: 0 };
  const right = vecNormalize(vecCross(forward, upApprox));
  const up = vecCross(right, forward);

  return { cameraPos, forward, right, up };
}

function projectPoint(worldPoint, target) {
  const width = els.flightCanvas.width;
  const height = els.flightCanvas.height;
  const { cameraPos, forward, right, up } = getCameraVectors(target);

  const relative = vecSub(worldPoint, cameraPos);
  const cameraX = vecDot(relative, right);
  const cameraY = vecDot(relative, up);
  const cameraZ = vecDot(relative, forward);

  if (cameraZ <= 0.1) {
    return null;
  }

  const fov = degreesToRadians(62);
  const focal = (height * 0.5) / Math.tan(fov * 0.5);

  return {
    x: width * 0.5 + (cameraX * focal) / cameraZ,
    y: height * 0.52 - (cameraY * focal) / cameraZ,
    depth: cameraZ,
  };
}

function draw3DLine(a, b, target, color, width = 1.4) {
  const pa = projectPoint(a, target);
  const pb = projectPoint(b, target);
  if (!pa || !pb) return;

  viewCtx.strokeStyle = color;
  viewCtx.lineWidth = width;
  viewCtx.beginPath();
  viewCtx.moveTo(pa.x, pa.y);
  viewCtx.lineTo(pb.x, pb.y);
  viewCtx.stroke();
}

function draw3DPolyline(points, target, color, width = 1.4, dash = []) {
  const projected = points.map((point) => projectPoint(point, target)).filter(Boolean);
  if (projected.length < 2) return;

  viewCtx.strokeStyle = color;
  viewCtx.lineWidth = width;
  viewCtx.setLineDash(dash);
  viewCtx.beginPath();
  viewCtx.moveTo(projected[0].x, projected[0].y);
  for (const point of projected) {
    viewCtx.lineTo(point.x, point.y);
  }
  viewCtx.stroke();
  viewCtx.setLineDash([]);
}

function drawWorldGrid(target) {
  for (let index = -10; index <= 10; index += 1) {
    const z = index * 1.4;
    draw3DLine({ x: -16, y: 0, z }, { x: 16, y: 0, z }, target, "rgba(150, 176, 235, 0.16)", 1);
  }
  for (let index = -10; index <= 10; index += 1) {
    const x = index * 1.4;
    draw3DLine({ x, y: 0, z: -16 }, { x, y: 0, z: 16 }, target, "rgba(150, 176, 235, 0.16)", 1);
  }
}

function drawGate3D(gate, passed, target) {
  const center = mapToWorld(gate, 0);
  const gateWidth = 1.12;
  const gateHeight = 2.05;

  const leftBottom = { x: center.x - gateWidth * 0.5, y: 0.5, z: center.z };
  const rightBottom = { x: center.x + gateWidth * 0.5, y: 0.5, z: center.z };
  const leftTop = { x: center.x - gateWidth * 0.5, y: 0.5 + gateHeight, z: center.z };
  const rightTop = { x: center.x + gateWidth * 0.5, y: 0.5 + gateHeight, z: center.z };

  const color = passed ? "rgba(52, 211, 153, 0.95)" : "rgba(96, 165, 250, 0.95)";
  draw3DLine(leftBottom, rightBottom, target, color, 2);
  draw3DLine(leftBottom, leftTop, target, color, 2);
  draw3DLine(rightBottom, rightTop, target, color, 2);
  draw3DLine(leftTop, rightTop, target, color, 2);
}

function buildDroneWireframe() {
  const arm = 0.88;
  const bodyHalf = 0.26;
  const rotorOffset = 0.18;

  const vertices = {
    nose: { x: 0.48, y: 0, z: 0 },
    tail: { x: -0.34, y: 0, z: 0 },
    left: { x: 0, y: 0, z: -arm },
    right: { x: 0, y: 0, z: arm },
    front: { x: arm, y: 0, z: 0 },
    rear: { x: -arm, y: 0, z: 0 },
    body1: { x: bodyHalf, y: bodyHalf * 0.45, z: bodyHalf * 0.7 },
    body2: { x: bodyHalf, y: bodyHalf * 0.45, z: -bodyHalf * 0.7 },
    body3: { x: -bodyHalf, y: bodyHalf * 0.45, z: -bodyHalf * 0.7 },
    body4: { x: -bodyHalf, y: bodyHalf * 0.45, z: bodyHalf * 0.7 },
  };

  const edges = [
    ["front", "rear"],
    ["left", "right"],
    ["nose", "tail"],
    ["body1", "body2"],
    ["body2", "body3"],
    ["body3", "body4"],
    ["body4", "body1"],
  ];

  const rotors = [
    { x: arm, y: 0, z: 0 },
    { x: -arm, y: 0, z: 0 },
    { x: 0, y: 0, z: arm },
    { x: 0, y: 0, z: -arm },
  ];

  return { vertices, edges, rotors, rotorRadius: rotorOffset };
}

const droneModel = buildDroneWireframe();

function drawDrone(target) {
  const p = state.path[state.path.length - 1] || startPoint;
  const world = mapToWorld(p, state.altitude + 0.3);
  const yaw = degreesToRadians(state.yawDeg);
  const pitch = degreesToRadians(state.pitchDeg);
  const roll = degreesToRadians(state.rollDeg);

  const transformed = {};
  for (const [key, value] of Object.entries(droneModel.vertices)) {
    transformed[key] = vecAdd(rotateLocalPoint(value, yaw, pitch, roll), world);
  }

  for (const [a, b] of droneModel.edges) {
    draw3DLine(transformed[a], transformed[b], target, "rgba(248, 252, 255, 0.95)", 2.2);
  }

  for (const rotorLocal of droneModel.rotors) {
    const rotorCenter = vecAdd(rotateLocalPoint(rotorLocal, yaw, pitch, roll), world);
    const rotorLeft = vecAdd(
      rotateLocalPoint({ x: rotorLocal.x, y: rotorLocal.y, z: rotorLocal.z - droneModel.rotorRadius }, yaw, pitch, roll),
      world,
    );
    const rotorRight = vecAdd(
      rotateLocalPoint({ x: rotorLocal.x, y: rotorLocal.y, z: rotorLocal.z + droneModel.rotorRadius }, yaw, pitch, roll),
      world,
    );
    draw3DLine(rotorLeft, rotorRight, target, "rgba(236, 242, 255, 0.75)", 1.5);

    const projected = projectPoint(rotorCenter, target);
    if (projected) {
      viewCtx.fillStyle = "rgba(248, 252, 255, 0.86)";
      viewCtx.beginPath();
      viewCtx.arc(projected.x, projected.y, 2.2, 0, Math.PI * 2);
      viewCtx.fill();
    }
  }
}

function drawFlightView() {
  const width = els.flightCanvas.width;
  const height = els.flightCanvas.height;
  viewCtx.clearRect(0, 0, width, height);

  const sky = viewCtx.createLinearGradient(0, 0, 0, height * 0.58);
  sky.addColorStop(0, "#11295f");
  sky.addColorStop(1, "#1a3564");
  viewCtx.fillStyle = sky;
  viewCtx.fillRect(0, 0, width, height * 0.58);

  const ground = viewCtx.createLinearGradient(0, height * 0.58, 0, height);
  ground.addColorStop(0, "#10253f");
  ground.addColorStop(1, "#0b1528");
  viewCtx.fillStyle = ground;
  viewCtx.fillRect(0, height * 0.58, width, height * 0.42);

  const dronePosition = mapToWorld(state.path[state.path.length - 1] || startPoint, state.altitude + 0.3);
  const target = { x: dronePosition.x, y: dronePosition.y, z: dronePosition.z };

  drawWorldGrid(target);

  for (let index = 0; index < gates.length; index += 1) {
    drawGate3D(gates[index], index < state.gateIndex, target);
  }

  const plannedWorld = state.plannedPath.map((point) => mapToWorld(point, 0.06));
  const actualWorld = state.path.map((point) => mapToWorld(point, 0.08));
  draw3DPolyline(plannedWorld, target, "rgba(34, 211, 238, 0.8)", 1.8, [8, 5]);
  draw3DPolyline(actualWorld, target, "rgba(251, 191, 36, 0.95)", 2.2);

  drawDrone(target);

  viewCtx.fillStyle = "rgba(236,242,255,0.92)";
  viewCtx.font = "13px Segoe UI";
  viewCtx.fillText(`Yaw: ${state.yawDeg.toFixed(1)}°`, 14, 22);
  viewCtx.fillText(`Pitch: ${state.pitchDeg.toFixed(1)}°`, 14, 40);
  viewCtx.fillText(`Roll: ${state.rollDeg.toFixed(1)}°`, 14, 58);
  viewCtx.fillText(`Cam dist: ${camera.distance.toFixed(1)} m`, 14, 76);
}

function render() {
  renderTelemetry();
  drawMap();
  drawFlightView();
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

function bind3DInteractions() {
  els.flightCanvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  els.flightCanvas.addEventListener("mousedown", (event) => {
    camera.dragging = true;
    camera.lastX = event.clientX;
    camera.lastY = event.clientY;
    camera.dragMode = event.shiftKey || event.button === 2 ? "pan" : "rotate";
  });

  window.addEventListener("mouseup", () => {
    camera.dragging = false;
  });

  window.addEventListener("mousemove", (event) => {
    if (!camera.dragging) return;

    const dx = event.clientX - camera.lastX;
    const dy = event.clientY - camera.lastY;
    camera.lastX = event.clientX;
    camera.lastY = event.clientY;

    if (camera.dragMode === "rotate") {
      camera.orbitYaw += dx * 0.008;
      camera.orbitPitch = clamp(camera.orbitPitch - dy * 0.006, -0.2, 1.28);
    } else {
      camera.panX -= dx * 0.022;
      camera.panY = clamp(camera.panY + dy * 0.022, -2, 8);
    }
  });

  els.flightCanvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const nextDistance = camera.distance + Math.sign(event.deltaY) * 1.25;
    camera.distance = clamp(nextDistance, 8, 42);
  });
}

els.startBtn.addEventListener("click", startMission);
els.pauseBtn.addEventListener("click", () => {
  if (!state.running) return;
  setRunning(false);
  state.phase = "paused";
  state.thinking.note = "Mission paused by operator; control outputs frozen.";
  addEvent("Mission paused");
  renderTelemetry();
});
els.resetBtn.addEventListener("click", resetMission);
els.preset.addEventListener("change", (event) => {
  state.preset = event.target.value;
  addEvent(`Preset switched to ${state.preset}`);
});

els.levelMode.addEventListener("change", (event) => {
  state.levelMode = event.target.value;

  if (state.levelMode === "normal") {
    setGates(normalGates);
    addEvent("Level mode switched to normal (3 gates)");
  } else {
    setGates(generateProceduralGates());
    addEvent(`Procedural level generated (${state.gatesTotal} gates)`);
  }

  resetMission();
});

els.generateLevelBtn.addEventListener("click", () => {
  state.levelMode = "procedural";
  els.levelMode.value = "procedural";
  setGates(generateProceduralGates());
  addEvent(`Procedural level generated (${state.gatesTotal} gates)`);
  resetMission();
});

bind3DInteractions();
resetMission();
requestAnimationFrame(loop);
