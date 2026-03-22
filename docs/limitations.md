# Assumptions and Limitations

- Internal simulator uses simplified translational dynamics and yaw-only attitude.
- Perception baseline is tuned for synthetic gate rendering and may not generalize to real scenes.
- Pose estimation assumes known rectangular gate dimensions and reliable corner ordering.
- Planner is local and reactive; global obstacle avoidance is not yet implemented.
- Mission logic covers key transitions and safety states but does not yet include full probabilistic recovery.
- Current metrics focus on MVP-level evaluation; richer diagnostics are planned in roadmap.
