/**
 * Remotion spring() presets (copilot.md §2.2) — the ONLY spring configs
 * allowed in the codebase. Four personalities cover every need; picking from
 * this table keeps overshoot consistent across the whole video.
 */
export const SPRINGS = {
  /** Badges, stamps, chips — playful, ~5% overshoot. */
  pop: { damping: 11, stiffness: 190, mass: 0.9 },
  /** Media landings — a confident settle, ~2% overshoot. */
  settle: { damping: 16, stiffness: 160, mass: 1.0 },
  /** Elegant moves — zero overshoot, long exhale. */
  silk: { damping: 26, stiffness: 120, mass: 1.0 },
  /** Fast UI bits, counters — snappy, minimal overshoot. */
  snap: { damping: 14, stiffness: 320, mass: 0.7 },
} as const;
