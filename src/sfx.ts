import React, { createContext, useContext } from 'react';
import { Audio, Sequence, staticFile, useVideoConfig } from 'remotion';

/**
 * The explainer's sound design layer. A small procedurally-generated library
 * (public/sfx, see scripts/gen-sfx.ts) gives the edit physical feedback:
 * flights whoosh past and punchlines hit with a stamp or a soft chime.
 * Everything is mixed WELL below the narration (1.3) and above the music bed
 * (~0.09) so the voice always leads.
 *
 * NOTE: the old per-bullet "pop" and per-tick sounds were deliberately
 * removed — a chirp on every point that lands read as cheap/noisy against the
 * clean editorial look. Text now animates silently; only camera flights and
 * punchlines carry sound. The pop and tick entries below are kept in the
 * library (harmless, unused) so the type/table stay in sync with gen-sfx.ts.
 *
 * All cues render through <SfxCue>, which mounts a <Sequence> only around the
 * sound's own few-second window — a 20-scene journey never has more than a
 * couple of audio tags active on any frame.
 */

export type SfxName =
  | 'whoosh_soft'
  | 'whoosh_deep'
  | 'whoosh_rise'
  | 'whoosh_impact'
  | 'pop_a'
  | 'pop_b'
  | 'pop_c'
  | 'stamp'
  | 'shimmer'
  | 'tick';

/** File durations in seconds — keep in sync with scripts/gen-sfx.ts. */
const DURATIONS: Record<SfxName, number> = {
  whoosh_soft: 1.1,
  whoosh_deep: 1.3,
  whoosh_rise: 1.4,
  whoosh_impact: 1.0,
  pop_a: 0.3,
  pop_b: 0.3,
  pop_c: 0.3,
  stamp: 0.7,
  shimmer: 1.0,
  tick: 0.14,
};

/** Per-sound base gain (its place in the mix); scaled by the global volume. */
const GAINS: Record<SfxName, number> = {
  whoosh_soft: 0.32,
  whoosh_deep: 0.36,
  whoosh_rise: 0.32,
  whoosh_impact: 0.36,
  pop_a: 0.4,
  pop_b: 0.4,
  pop_c: 0.4,
  stamp: 0.52,
  shimmer: 0.42,
  tick: 0.32,
};

/** Rotating pop pool so a run of bullets doesn't machine-gun one pitch. */
export const POPS: SfxName[] = ['pop_a', 'pop_b', 'pop_c'];

/** A sound's natural length in seconds (for fitting cues to flight windows). */
export const sfxDuration = (name: SfxName): number => DURATIONS[name];

export interface SfxConfig {
  enabled: boolean;
  volume: number;
}

const SfxContext = createContext<SfxConfig>({ enabled: true, volume: 1 });

export const SfxProvider: React.FC<{ config?: { enabled?: boolean; volume?: number } | null; children: React.ReactNode }> = ({
  config,
  children,
}) =>
  React.createElement(
    SfxContext.Provider,
    {
      value: {
        enabled: config?.enabled !== false,
        volume: Math.max(0, Math.min(2, config?.volume ?? 1)),
      },
    },
    children
  );

export const useSfx = (): SfxConfig => useContext(SfxContext);

/**
 * One sound effect at an absolute frame of the CURRENT clock. In canvas mode
 * nothing re-bases the clock, so `at` is a global frame; inside a slides-mode
 * scene Sequence it is scene-relative — both are simply "the current
 * Remotion clock", which is what <Sequence from> expects.
 */
export const SfxCue: React.FC<{
  name: SfxName;
  at: number;
  volume?: number;
  /** Stretch/compress (and re-pitch) the sound, e.g. to ride a longer flight. */
  playbackRate?: number;
}> = ({ name, at, volume = 1, playbackRate = 1 }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const cfg = useSfx();
  if (!cfg.enabled) return null;

  const rate = Math.max(0.5, Math.min(2, playbackRate));
  const from = Math.max(0, Math.round(at));
  if (from >= durationInFrames - 2) return null;
  const frames = Math.min(Math.ceil((DURATIONS[name] / rate) * fps) + 2, durationInFrames - from);

  return React.createElement(
    Sequence,
    { from, durationInFrames: frames, layout: 'none' },
    React.createElement(Audio, {
      src: staticFile(`sfx/${name}.wav`),
      volume: GAINS[name] * volume * cfg.volume,
      playbackRate: rate,
    })
  );
};
