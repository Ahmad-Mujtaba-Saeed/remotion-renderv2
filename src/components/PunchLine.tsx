import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Scene, PunchlineStyle } from '../types';
import { useTheme } from '../theme';
import { useScaleUnit } from '../responsive';
import { useSceneWindow } from '../canvas/SceneClock';

/**
 * A narration-synced punchline: a short phrase lifted verbatim from the
 * voiceover that pops on screen with its own backdrop the moment the narrator
 * reaches it, lighting up word by word as each is spoken (karaoke-accurate —
 * the timings come from Kokoro's real token timestamps).
 *
 * Three looks, chosen by the backend per scene:
 *  - "plate": a soft glass plate rising from the lower third (the default).
 *  - "stamp": bold uppercase slammed on with an accent underline.
 *  - "quote": an oversized quotation mark with an italic line.
 * Every look sits on a radial scrim so it stays legible over busy media.
 * No CSS filters / backdrop-filters — transform + opacity only, so the
 * overlay can never soften the text underneath it (see SceneRegion).
 */
export const PunchLine: React.FC<{ scene: Scene }> = ({ scene }) => {
  const p = scene.punchline;
  const theme = useTheme();
  const { fps } = useVideoConfig();
  const u = useScaleUnit();
  const frame = useCurrentFrame();
  const win = useSceneWindow();

  if (!p || !p.words?.length) return null;

  // Seconds since this scene's narration began. In canvas mode the narration
  // starts at the scene window (travel included); in slides mode the current
  // Sequence clock IS the narration clock.
  const base = win?.narrationStart ?? 0;
  const t = (frame - base) / fps;

  const lead = 0.3; // the plate lands a breath before the first word
  const appearAt = p.start - lead;
  const holdUntil = p.end + 1.0;
  if (t < appearAt || t > holdUntil + 0.55) return null;

  const style: PunchlineStyle = p.style ?? 'plate';

  const enter = spring({
    frame: Math.max(0, Math.round((t - appearAt) * fps)),
    fps,
    config: style === 'stamp' ? { damping: 11, mass: 0.8 } : { damping: 15 },
    durationInFrames: Math.round(fps * 0.55),
  });
  const exit = interpolate(t, [holdUntil, holdUntil + 0.5], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const words = p.words.map((w, i) => {
    const spoken = t >= w.start;
    const isCurrent = t >= w.start && t <= w.end + 0.14;
    const popFrame = Math.max(0, Math.round((t - w.start) * fps));
    const pop = spoken
      ? spring({ frame: popFrame, fps, config: { damping: 12, mass: 0.6 }, durationInFrames: Math.round(fps * 0.35) })
      : 0;
    const scale = 1 + (style === 'stamp' ? 0.1 : 0.07) * (1 - Math.min(1, pop)) * (spoken ? 1 : 0) + (isCurrent ? 0.035 : 0);

    return (
      <span
        key={i}
        style={{
          display: 'inline-block',
          marginRight: '0.3em',
          opacity: spoken ? 1 : 0.34,
          color: isCurrent ? theme.accent : theme.text,
          textShadow: isCurrent ? `0 0 ${26 * u}px ${theme.accent}99` : undefined,
          transform: `scale(${scale}) translateY(${spoken ? 0 : 5 * u}px)`,
          transition: 'none',
        }}
      >
        {w.word}
      </span>
    );
  });

  // Shared backdrop scrim: keeps the line readable over any media without
  // touching (or blurring) what's underneath.
  const scrim = (
    <div
      style={{
        position: 'absolute',
        inset: `${-90 * u}px ${-140 * u}px`,
        background: `radial-gradient(58% 105% at 50% 55%, ${theme.bg_from}d9, ${theme.bg_from}66 62%, transparent 78%)`,
        borderRadius: 999,
        zIndex: -1,
      }}
    />
  );

  let inner: React.ReactNode;
  if (style === 'stamp') {
    inner = (
      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          transform: `rotate(-2.2deg) scale(${interpolate(enter, [0, 1], [1.45, 1])})`,
          opacity: enter,
        }}
      >
        {scrim}
        <div
          style={{
            fontSize: 58 * u,
            fontWeight: 900,
            letterSpacing: 1.5 * u,
            textTransform: 'uppercase',
            lineHeight: 1.14,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {words}
        </div>
        <div
          style={{
            height: 10 * u,
            width: `${interpolate(enter, [0, 1], [0, 62])}%`,
            margin: `${14 * u}px auto 0`,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`,
            boxShadow: `0 0 ${30 * u}px ${theme.accent}88`,
          }}
        />
      </div>
    );
  } else if (style === 'quote') {
    inner = (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 22 * u,
          padding: `${26 * u}px ${44 * u}px`,
          borderRadius: 30 * u,
          background: `linear-gradient(150deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02)), ${theme.panel}`,
          border: '1px solid rgba(255,255,255,0.13)',
          borderLeft: `${8 * u}px solid ${theme.accent}`,
          boxShadow: `0 ${26 * u}px ${80 * u}px rgba(0,0,0,0.5)`,
          transform: `translateX(${interpolate(enter, [0, 1], [-46 * u, 0])}px)`,
          opacity: enter,
        }}
      >
        {scrim}
        <span
          style={{
            fontSize: 92 * u,
            lineHeight: 0.7,
            fontWeight: 900,
            color: theme.accent,
            fontFamily: 'Georgia, serif',
            transform: `translateY(${10 * u}px)`,
          }}
        >
          &ldquo;
        </span>
        <div
          style={{
            fontSize: 46 * u,
            fontWeight: 700,
            fontStyle: 'italic',
            lineHeight: 1.3,
            fontFamily: 'Inter, system-ui, sans-serif',
            paddingTop: 6 * u,
          }}
        >
          {words}
        </div>
      </div>
    );
  } else {
    // plate
    inner = (
      <div
        style={{
          position: 'relative',
          padding: `${24 * u}px ${48 * u}px`,
          borderRadius: 26 * u,
          background: `linear-gradient(150deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)), ${theme.panel}`,
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: `0 ${26 * u}px ${80 * u}px rgba(0,0,0,0.5), 0 0 ${46 * u}px ${theme.accent}22`,
          transform: `translateY(${interpolate(enter, [0, 1], [40 * u, 0])}px) scale(${interpolate(enter, [0, 1], [0.94, 1])})`,
          opacity: enter,
        }}
      >
        {scrim}
        <div
          style={{
            position: 'absolute',
            top: -6 * u,
            left: 48 * u,
            width: 76 * u,
            height: 8 * u,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`,
            boxShadow: `0 0 ${24 * u}px ${theme.accent}88`,
          }}
        />
        <div
          style={{
            fontSize: 46 * u,
            fontWeight: 800,
            lineHeight: 1.26,
            fontFamily: 'Inter, system-ui, sans-serif',
            textAlign: 'center',
          }}
        >
          {words}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '6.5%',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity: exit,
        zIndex: 40,
      }}
    >
      <div style={{ maxWidth: '82%' }}>{inner}</div>
    </div>
  );
};
