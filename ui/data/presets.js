export const COURSE_PRESETS = {
  easy: {
    name: "Easy",
    speedScale: 1,
    droneStart: { x: 0, y: -1.8, z: 1.2, heading: 0, battery: 100 },
    gates: [
      { id: 1, x: 12, y: 0, z: 1.2, width: 3.0, height: 2.4 },
      { id: 2, x: 24, y: 3, z: 1.25, width: 2.8, height: 2.2 },
      { id: 3, x: 36, y: -2.5, z: 1.3, width: 2.8, height: 2.2 },
      { id: 4, x: 48, y: 1.5, z: 1.3, width: 2.6, height: 2.1 },
    ],
  },
  medium: {
    name: "Medium",
    speedScale: 1.15,
    droneStart: { x: 0, y: -2.4, z: 1.25, heading: 0, battery: 100 },
    gates: [
      { id: 1, x: 11, y: 0.2, z: 1.2, width: 2.7, height: 2.1 },
      { id: 2, x: 20, y: 4.2, z: 1.25, width: 2.4, height: 1.9 },
      { id: 3, x: 29, y: 1.0, z: 1.15, width: 2.3, height: 1.9 },
      { id: 4, x: 39, y: -3.2, z: 1.25, width: 2.2, height: 1.85 },
      { id: 5, x: 49, y: -0.3, z: 1.28, width: 2.1, height: 1.8 },
      { id: 6, x: 60, y: 3.4, z: 1.3, width: 2.1, height: 1.8 },
    ],
  },
  noisy: {
    name: "Noisy",
    speedScale: 1.25,
    droneStart: { x: 0, y: -2.8, z: 1.3, heading: 0, battery: 100 },
    gates: [
      { id: 1, x: 10, y: 1.4, z: 1.22, width: 2.6, height: 2.0 },
      { id: 2, x: 18, y: -3.6, z: 1.25, width: 2.2, height: 1.8 },
      { id: 3, x: 27, y: 2.8, z: 1.2, width: 2.0, height: 1.7 },
      { id: 4, x: 35, y: -1.8, z: 1.25, width: 1.9, height: 1.7 },
      { id: 5, x: 45, y: 4.5, z: 1.2, width: 1.8, height: 1.65 },
      { id: 6, x: 54, y: -4.0, z: 1.3, width: 1.8, height: 1.6 },
      { id: 7, x: 65, y: 1.2, z: 1.25, width: 1.75, height: 1.55 },
    ],
  },
};

export const AUTONOMY_MODE = "AUTO_GATES";
