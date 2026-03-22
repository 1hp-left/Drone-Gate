# Roadmap

## ROS 2 Integration

- Create ROS 2 nodes per module (`perception_node`, `estimation_node`, `planner_node`, `controller_node`, `mission_node`).
- Replace direct in-process calls with typed message interfaces (`sensor_msgs`, `geometry_msgs`, custom gate messages).
- Add launch files for full autonomy graph and per-module debug.

## PX4 Offboard Control

- Add PX4 adapter translating `ControlCommand` to offboard setpoints.
- Implement safety watchdog and mode transitions (arm, offboard, fail-safe).
- Validate in PX4 SITL before hardware.

Status: AirSim backend adapter scaffold is implemented for simulation backend switching; PX4 adapter remains pending.

## Real-World Calibration

- Add camera intrinsic calibration pipeline and persistence.
- Add camera-IMU extrinsic calibration hooks.
- Add gate size calibration and domain-shift checks for lighting/motion blur.

## Model Improvements

- Integrate lightweight neural detector backend and benchmark against classical CV.
- Add temporal multi-object tracking for gate ID consistency.
- Add uncertainty-aware planner and recovery behaviors under detection dropouts.

## TODO Grouping

- TODO-PERCEPTION: robust detector backend + tracker.
- TODO-ESTIMATION: EKF/VIO fusion.
- TODO-PLANNING: minimum-jerk or MPC local planner.
- TODO-CONTROL: geometric controller and attitude-level abstraction.
- TODO-SIM: complete AirSim adapter robustness and add Gazebo adapter package.
