import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Scene, PunchlineStyle } from '../types';
import { useTheme, useDisplayFont, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { useSceneWindow } from '../canvas/SceneClock';
import { SfxCue } from '../sfx';

/**
 * A narration-synced punchline: a short phrase lifted verbatim from the
 * voiceover that lands on screen the moment the narrator reaches it, lighting
 * up word by word as each is spoken (karaoke-accurate — the timings come from
 * Kokoro's real token timestamps).
 *
 * SCREEN SPACE ONLY: this component is mounted OUTSIDE the camera-scaled
 * world (CanvasJourney's HUD layer / the slides Sequence), so its text is
 * always pixel-crisp regardless of camera zoom AND it may safely use real
 * backdrop-filter glass — the no-filters rule only applies INSIDE the scaled
 * world, where mid-flight rasters get reused (the blurry-text bug).
 *
 * Three looks, chosen by the backend per scene:
 *  - "glass" (also legacy "plate"): a bold, centered frosted-glass card —
 *    the world blurs through it while the words punch over it.
 *  - "stamp": full-width uppercase SLAM with an impact ring and a thud.
 *  - "quote": an editorial serif pull-quote on a glass bar.
 */
export const PunchLine: React.FC<{ scene: Scene }> = ({ scene }) => {
  const p = scene.punchline;
  const theme = useTheme();
  const displayFont = useDisplayFont();
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

  const style: PunchlineStyle = p.style === 'plate' ? 'glass' : (p.style ?? 'glass');

  const lead = 0.3; // the card lands a breath before the first word
  const appearAt = p.start - lead;
  const holdUntil = p.end + 1.0;

  // Entrance sound cue frames (absolute on the current clock).
  const cueAt = base + Math.round(Math.max(0, appearAt) * fps);
  const sound =
    style === 'stamp' ? (
      <SfxCue name="stamp" at={cueAt + Math.round(fps * 0.1)} volume={1} />
    ) : (
      <SfxCue name="shimmer" at={cueAt} volume={style === 'quote' ? 0.7 : 1} />
    );

  if (t < appearAt || t > holdUntil + 0.55) return null;

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

  // How much of the line has been spoken (drives the glass progress bar).
  const spokenProgress = interpolate(t, [p.start, Math.max(p.start + 0.1, p.end)], [0, 1], {
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
    const scale = 1 + (style === 'stamp' ? 0.1 : 0.07) * (1 - Math.min(1, pop)) * (spoken ? 1 : 0) + (isCurrent ? 0.04 : 0);

    return (
      <span
        key={i}
        style={{
          display: 'inline-block',
          marginRight: '0.3em',
          opacity: spoken ? 1 : 0.32,
          color: isCurrent ? theme.accent : theme.text,
          textShadow: isCurrent ? `0 0 ${28 * u}px ${theme.accent}aa` : undefined,
          transform: `scale(${scale}) translateY(${spoken ? 0 : 6 * u}px)`,
          transition: 'none',
        }}
      >
        {w.word}
      </span>
    );
  });

  let inner: React.ReactNode;
  let vertical: React.CSSProperties = { bottom: '7%' };

  if (style === 'stamp') {
    // Center-screen slam. The ring detonates outward as the text lands, and
    // the whole block shakes off the impact for a few frames.
    vertical = { top: 0, bottom: 0, alignItems: 'center' };
    const impactF = Math.max(0, Math.round((t - appearAt) * fps) - Math.round(fps * 0.14));
    const ring = spring({ frame: impactF, fps, config: { damping: 22, stiffness: 60 }, durationInFrames: Math.round(fps * 0.8) });
    const shake = Math.max(0, 1 - impactF / 8);
    const shakeX = Math.sin(impactF * 2.7) * 5 * u * shake;
    const shakeY = Math.cos(impactF * 3.3) * 4 * u * shake;
    inner = (
      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          transform: `rotate(-2.4deg) scale(${interpolate(enter, [0, 1], [1.55, 1])}) translate(${shakeX}px, ${shakeY}px)`,
          opacity: enter,
        }}
      >
        {/* Impact ring */}
        {impactF > 0 ? (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: `${interpolate(ring, [0, 1], [30, 190])}%`,
              aspectRatio: '1.6',
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              border: `${3 * u}px solid ${theme.accent}`,
              opacity: 0.55 * (1 - ring),
              pointerEvents: 'none',
            }}
          />
        ) : null}
        <div
          style={{
            position: 'absolute',
            inset: `${-70 * u}px ${-120 * u}px`,
            background: `radial-gradient(56% 100% at 50% 50%, ${theme.bg_from}e6, ${theme.bg_from}77 60%, transparent 80%)`,
            borderRadius: 999,
            zIndex: -1,
          }}
        />
        <div
          style={{
            fontSize: 74 * u,
            fontWeight: 900,
            letterSpacing: 2 * u,
            textTransform: 'uppercase',
            lineHeight: 1.1,
            fontFamily: displayFont,
          }}
        >
          {words}
        </div>
        <div
          style={{
            height: 12 * u,
            width: `${interpolate(enter, [0, 1], [0, 64])}%`,
            margin: `${16 * u}px auto 0`,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`,
            boxShadow: `0 0 ${34 * u}px ${theme.accent}99`,
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
          padding: `${28 * u}px ${48 * u}px`,
          borderRadius: 30 * u,
          background: 'rgba(255,255,255,0.055)',
          backdropFilter: 'blur(22px) saturate(1.35)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.35)',
          border: '1px solid rgba(255,255,255,0.16)',
          borderLeft: `${8 * u}px solid ${theme.accent}`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 ${26 * u}px ${80 * u}px rgba(0,0,0,0.5)`,
          transform: `translateX(${interpolate(enter, [0, 1], [-46 * u, 0])}px)`,
          opacity: enter,
        }}
      >
        <span
          style={{
            fontSize: 100 * u,
            lineHeight: 0.7,
            fontWeight: 900,
            color: theme.accent,
            fontFamily: 'Georgia, serif',
            transform: `translateY(${12 * u}px)`,
          }}
        >
          &ldquo;
        </span>
        <div
          style={{
            fontSize: 48 * u,
            fontWeight: 700,
            fontStyle: 'italic',
            lineHeight: 1.3,
            fontFamily: 'Georgia, Cambria, serif',
            paddingTop: 6 * u,
          }}
        >
          {words}
        </div>
      </div>
    );
  } else {
    // glass — the signature look: a bold centered line on real frosted glass.
    inner = (
      <div
        style={{
          position: 'relative',
          padding: `${30 * u}px ${58 * u}px ${34 * u}px`,
          borderRadius: 32 * u,
          background: `linear-gradient(165deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))`,
          backdropFilter: 'blur(26px) saturate(1.45)',
          WebkitBackdropFilter: 'blur(26px) saturate(1.45)',
          border: '1.5px solid rgba(255,255,255,0.18)',
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), 0 ${28 * u}px ${90 * u}px rgba(0,0,0,0.55), 0 0 ${60 * u}px ${theme.accent}26`,
          transform: `translateY(${interpolate(enter, [0, 1], [46 * u, 0])}px) scale(${interpolate(enter, [0, 1], [0.93, 1])})`,
          opacity: enter,
          overflow: 'hidden',
        }}
      >
        {/* Accent glow pooling in one corner of the glass. */}
        <div
          style={{
            position: 'absolute',
            width: '60%',
            height: '120%',
            left: '-18%',
            top: '-60%',
            background: `radial-gradient(50% 50% at 50% 50%, ${theme.accent}30, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            fontSize: 52 * u,
            fontWeight: 850,
            lineHeight: 1.24,
            fontFamily: displayFont,
            textAlign: 'center',
            position: 'relative',
          }}
        >
          {words}
        </div>
        {/* Spoken-progress underline: fills as the narrator works the line. */}
        <div
          style={{
            position: 'relative',
            height: 7 * u,
            marginTop: 18 * u,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.12)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: `${spokenProgress * 100}%`,
              borderRadius: 999,
              background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`,
              boxShadow: `0 0 ${18 * u}px ${theme.accent}88`,
            }}
          />
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
        ...vertical,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity: exit,
        zIndex: 40,
      }}
    >
      {sound}
      <div style={{ maxWidth: '84%' }}>{inner}</div>
    </div>
  );
};
