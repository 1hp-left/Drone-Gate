import { AUTONOMY_MODE, COURSE_PRESETS } from "../data/presets.js";

const PHASES = [
  "Searching for gate",
  "Gate acquired",
  "Aligning",
  "Traversing",
  "Exiting gate",
  "Reacquiring next gate",
  "Mission complete",
  "Fail-safe / Hover",
];

function nowStamp(simTime) {
  return `${simTime.toFixed(1)}s`;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function seedHealth() {
  return {
    perception: "healthy",
    planner: "healthy",
    controller: "healthy",
    localization: "healthy",
    overall: "healthy",
  };
}

export class MissionSimulator {
  constructor() {
    this.listeners = new Set();
    this.simSpeed = 1;
    this.reset("easy");
  }

  onUpdate(cb) {
    this.listeners.add(cb);
    cb(this.snapshot());
    return () => this.listeners.delete(cb);
  }

  emit() {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  snapshot() {
    return {
      drone: { ...this.drone },
      gates: this.gates.map((g) => ({ ...g })),
      trajectory: this.trajectory.map((p) => ({ ...p })),
      actual_path: this.actualPath.map((p) => ({ ...p })),
      mission_state: this.missionState,
      mission_phase: this.missionPhase,
      autonomy_mode: AUTONOMY_MODE,
      system_health: { ...this.systemHealth },
      event_log: [...this.eventLog],
      telemetry: { ...this.telemetry },
      progress: {
        completed: this.completedGates,
        total: this.gates.length,
      },
      sim: {
        speed: this.simSpeed,
        running: this.running,
        simTime: this.simTime,
      },
      ui: {
        selectedPreset: this.selectedPreset,
      },
    };
  }

  reset(presetName = this.selectedPreset) {
    this.selectedPreset = COURSE_PRESETS[presetName] ? presetName : "easy";
    this.preset = COURSE_PRESETS[this.selectedPreset];

    this.simTime = 0;
    this.running = false;
    this.missionPhase = PHASES[0];
    this.missionState = "idle";
    this.eventId = 0;
    this.completedGates = 0;
    this.currentGateIdx = 0;
    this.targetTimer = 0;
    this.loopLatencyMs = 12;

    this.drone = {
      ...this.preset.droneStart,
      speed: 0,
      vx: 0,
      vy: 0,
      yaw: this.preset.droneStart.heading,
    };

    this.gates = this.preset.gates.map((g) => ({
      ...g,
      status: "pending",
      confidence: 0.5,
      passTime: null,
    }));
    if (this.gates.length > 0) {
      this.gates[0].status = "target";
    }

    this.trajectory = this.buildTrajectory();
    this.actualPath = [{ x: this.drone.x, y: this.drone.y, z: this.drone.z }];

    this.systemHealth = seedHealth();
    this.telemetry = {
      speed: 0,
      altitude: this.drone.z,
      heading: 0,
      distanceToNextGate: dist2D(this.drone, this.gates[0]),
      gateDetectionConfidence: 0.5,
      battery: this.drone.battery,
      latency: this.loopLatencyMs,
      loopTimeMs: this.loopLatencyMs,
      overallConfidence: 0.7,
    };

    this.eventLog = [];
    this.logEvent("Course reset", "info");
    this.emit();
  }

  start() {
    if (this.missionState === "complete") {
      this.reset(this.selectedPreset);
    }
    this.running = true;
    this.missionState = "running";
    this.logEvent("Mission started", "success");
    this.emit();
  }

  pauseResume() {
    if (this.missionState === "complete") {
      return;
    }
    this.running = !this.running;
    this.missionState = this.running ? "running" : "paused";
    this.logEvent(this.running ? "Simulation resumed" : "Simulation paused", "info");
    this.emit();
  }

  setSpeed(multiplier) {
    this.simSpeed = clamp(multiplier, 0.25, 4);
    this.emit();
  }

  setPreset(name) {
    this.reset(name);
  }

  stepGate() {
    if (this.currentGateIdx >= this.gates.length) {
      return;
    }
    const gate = this.gates[this.currentGateIdx];
    gate.status = "passed";
    gate.passTime = this.simTime;
    this.completedGates += 1;
    this.logEvent(`Gate ${gate.id} stepped as passed`, "warning");
    this.currentGateIdx += 1;

    if (this.currentGateIdx >= this.gates.length) {
      this.missionPhase = PHASES[6];
      this.missionState = "complete";
      this.running = false;
      this.logEvent("Mission complete", "success");
    } else {
      this.missionPhase = PHASES[5];
    }
    this.emit();
  }

  togglePathNoise() {
    this.injectWarning("Confidence dropped; replanning path", 0.35);
  }

  injectWarning(message, confidenceFloor = 0.45) {
    this.telemetry.gateDetectionConfidence = Math.min(
      this.telemetry.gateDetectionConfidence,
      confidenceFloor
    );
    this.systemHealth.perception = "warning";
    this.systemHealth.overall = "warning";
    this.logEvent(message, "warning");
    this.emit();
  }

  buildTrajectory() {
    const points = [{ x: this.preset.droneStart.x, y: this.preset.droneStart.y, z: this.preset.droneStart.z }];
    this.preset.gates.forEach((gate) => {
      points.push({ x: gate.x - 1.6, y: gate.y, z: gate.z });
      points.push({ x: gate.x, y: gate.y, z: gate.z });
      points.push({ x: gate.x + 2.2, y: gate.y, z: gate.z + 0.05 });
    });
    return points;
  }

  update(deltaSeconds) {
    if (!this.running) {
      return;
    }

    const dt = deltaSeconds * this.simSpeed * this.preset.speedScale;
    this.simTime += dt;
    this.loopLatencyMs = 11 + Math.random() * 8;

    if (this.currentGateIdx >= this.gates.length) {
      this.running = false;
      this.missionState = "complete";
      this.missionPhase = PHASES[6];
      this.logEvent("Mission complete", "success");
      this.emit();
      return;
    }

    const gate = this.gates[this.currentGateIdx];
    const dist = dist2D(this.drone, gate);
    const desiredSpeed = clamp(9.5 - dist * 0.24, 2.6, 8.4);

    const dx = gate.x - this.drone.x;
    const dy = gate.y - this.drone.y;
    const headingTarget = Math.atan2(dy, dx);
    const headingErr = ((headingTarget - this.drone.heading + Math.PI) % (2 * Math.PI)) - Math.PI;

    this.drone.heading += headingErr * clamp(dt * 2.8, 0, 0.3);
    this.drone.speed += (desiredSpeed - this.drone.speed) * clamp(dt * 2.1, 0, 0.35);

    this.drone.vx = Math.cos(this.drone.heading) * this.drone.speed;
    this.drone.vy = Math.sin(this.drone.heading) * this.drone.speed;

    this.drone.x += this.drone.vx * dt;
    this.drone.y += this.drone.vy * dt;
    this.drone.z += (gate.z - this.drone.z) * clamp(dt * 1.2, 0, 0.2);
    this.drone.battery = clamp(this.drone.battery - dt * 0.3, 0, 100);

    const confidenceNoise = this.selectedPreset === "noisy" ? 0.35 : this.selectedPreset === "medium" ? 0.2 : 0.12;
    const confidenceBase = clamp(1.03 - dist * 0.05 + (Math.random() - 0.5) * confidenceNoise, 0.18, 0.99);

    gate.confidence = confidenceBase;
    this.telemetry.gateDetectionConfidence = confidenceBase;

    if (confidenceBase < 0.38) {
      this.systemHealth.perception = "warning";
      this.systemHealth.overall = "warning";
      this.missionPhase = PHASES[7];
      this.targetTimer += dt;

      if (this.targetTimer > 0.6) {
        this.logEvent(`Confidence dropped near Gate ${gate.id}`, "warning");
        this.targetTimer = 0;
      }
    } else {
      this.systemHealth.perception = "healthy";
      this.systemHealth.overall = "healthy";
      if (dist > 7.5) {
        this.missionPhase = PHASES[0];
      } else if (dist > 4.3) {
        this.missionPhase = PHASES[1];
      } else if (dist > 1.8) {
        this.missionPhase = PHASES[2];
      } else if (dist > 0.8) {
        this.missionPhase = PHASES[3];
      } else {
        this.missionPhase = PHASES[4];
      }
    }

    if (dist < 0.95) {
      gate.status = "passed";
      gate.passTime = this.simTime;
      this.completedGates += 1;
      this.logEvent(`Gate ${gate.id} passed successfully`, "success");
      this.currentGateIdx += 1;

      if (this.currentGateIdx < this.gates.length) {
        this.gates[this.currentGateIdx].status = "target";
        this.missionPhase = PHASES[5];
        this.logEvent(`Gate ${this.gates[this.currentGateIdx].id} acquired`, "info");
        this.logEvent("Trajectory replanned", "info");
      } else {
        this.missionPhase = PHASES[6];
        this.missionState = "complete";
        this.running = false;
        this.logEvent("Mission complete", "success");
      }
    }

    this.gates.forEach((g, idx) => {
      if (idx < this.currentGateIdx) g.status = "passed";
      else if (idx === this.currentGateIdx && this.missionState !== "complete") g.status = "target";
      else g.status = "pending";
    });

    this.actualPath.push({ x: this.drone.x, y: this.drone.y, z: this.drone.z });
    if (this.actualPath.length > 900) {
      this.actualPath.shift();
    }

    this.systemHealth.localization = this.selectedPreset === "noisy" && Math.random() < 0.02 ? "warning" : "healthy";
    this.systemHealth.planner = Math.random() < 0.015 ? "warning" : "healthy";
    this.systemHealth.controller = this.telemetry.speed > 8.2 ? "warning" : "healthy";
    if (Object.values(this.systemHealth).some((v) => v === "critical")) {
      this.systemHealth.overall = "critical";
    } else if (Object.values(this.systemHealth).some((v) => v === "warning")) {
      this.systemHealth.overall = "warning";
    } else {
      this.systemHealth.overall = "healthy";
    }

    this.telemetry = {
      speed: this.drone.speed,
      altitude: this.drone.z,
      heading: ((this.drone.heading * 180) / Math.PI + 360) % 360,
      distanceToNextGate:
        this.currentGateIdx < this.gates.length ? dist2D(this.drone, this.gates[this.currentGateIdx]) : 0,
      gateDetectionConfidence: this.telemetry.gateDetectionConfidence,
      battery: this.drone.battery,
      latency: this.loopLatencyMs,
      loopTimeMs: this.loopLatencyMs,
      overallConfidence: clamp(
        0.48 * this.telemetry.gateDetectionConfidence +
          0.22 * (this.systemHealth.controller === "healthy" ? 1 : 0.65) +
          0.3 * (this.systemHealth.localization === "healthy" ? 1 : 0.62),
        0.15,
        0.99
      ),
    };

    this.emit();
  }

  logEvent(message, severity = "info") {
    this.eventId += 1;
    this.eventLog.unshift({
      id: this.eventId,
      ts: nowStamp(this.simTime),
      severity,
      message,
    });
    this.eventLog = this.eventLog.slice(0, 140);
  }
}

export const PHASE_LABELS = PHASES;
