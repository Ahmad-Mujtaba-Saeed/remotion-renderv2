import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Scene, PunchlineStyle } from '../types';
import { useTheme, useDisplayFont, inkOn } from '../theme';
import { surfaceStyle } from './Surface';
import { useScaleUnit } from '../responsive';
import { useSceneWindow } from '../canvas/SceneClock';
import { SfxCue } from '../sfx';

/**
 * A narration-synced punchline: a short phrase lifted verbatim from the
 * voiceover that lands on screen the moment the narrator reaches it, lighting
 * up word by word as each is spoken (karaoke-accurate — the timings come from
 * Kokoro's real token timestamps).
 *
 * SCREEN SPACE ONLY: mounted OUTSIDE the camera-scaled world (CanvasJourney's
 * HUD layer / the slides Sequence), so its text is always pixel-crisp whatever
 * the camera is doing.
 *
 * Three looks, chosen by the backend per scene. All three are flat colour
 * blocks — no glass, no glow, no drop shadow:
 *  - "card" (payload: "glass"/"plate"): a solid accent-coloured poster card
 *    with ink-toned type and a spoken-progress rule.
 *  - "stamp": full-width uppercase SLAM on a solid field, with an impact ring.
 *  - "quote": a serif pull-quote on a panel block behind an accent rule.
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

  // The flagship "card" look flips the palette: the card itself IS the accent
  // colour, so its type must read in ink tones instead of the usual
  // light-text-on-dark-panel scheme.
  const isCard = style === 'glass';

  const cueAt = base + Math.round(Math.max(0, appearAt) * fps);
  const sound =
    style === 'stamp' ? (
      <SfxCue name="stamp" at={cueAt + Math.round(fps * 0.1)} volume={1} />
    ) : (
      <SfxCue name="shimmer" at={cueAt} volume={style === 'quote' ? 0.7 : 0.8} />
    );

  if (t < appearAt || t > holdUntil + 0.55) return null;

  const enter = spring({
    frame: Math.max(0, Math.round((t - appearAt) * fps)),
    fps,
    config: style === 'stamp' ? { damping: 11, mass: 0.8 } : isCard ? { damping: 12, mass: 0.7 } : { damping: 15 },
    durationInFrames: Math.round(fps * 0.55),
  });
  const exit = interpolate(t, [holdUntil, holdUntil + 0.5], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // How much of the line has been spoken (drives the progress rule).
  const spokenProgress = interpolate(t, [p.start, Math.max(p.start + 0.1, p.end)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Word ink: the card is a solid accent field, so its ink is chosen for
  // maximum contrast against the ACCENT (works on any theme + any accent — a
  // dark accent gets cream ink, a bright accent gets near-black); the current
  // word pops to the opposite tone as it's spoken. Every other style keeps the
  // theme's own text colour (which already flips ink/paper per light/dark) and
  // lifts the spoken word to the accent. The pop is colour and scale — never a
  // glow.
  const cardInk = inkOn(theme.accent);
  const cardPop = cardInk === '#17120E' ? '#FBF7F0' : '#17120E';
  const baseInk = isCard ? cardInk : theme.text;
  const hotInk = isCard ? cardPop : theme.accent;

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
          opacity: spoken ? 1 : isCard ? 0.42 : 0.32,
          color: isCurrent ? hotInk : baseInk,
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
  // The stamp's backing band runs edge to edge, so its wrapper must not be
  // clamped to the 84% the docked looks use.
  let wrapMaxWidth = '84%';

  if (style === 'stamp') {
    // Center-screen slam. The ring detonates outward as the text lands, and
    // the whole block shakes off the impact for a few frames.
    vertical = { top: 0, bottom: 0, alignItems: 'center' };
    wrapMaxWidth = '100%';
    const impactF = Math.max(0, Math.round((t - appearAt) * fps) - Math.round(fps * 0.14));
    const ring = spring({ frame: impactF, fps, config: { damping: 22, stiffness: 60 }, durationInFrames: Math.round(fps * 0.8) });
    const shake = Math.max(0, 1 - impactF / 8);
    const shakeX = Math.sin(impactF * 2.7) * 5 * u * shake;
    const shakeY = Math.cos(impactF * 3.3) * 4 * u * shake;
    inner = (
      <div style={{ position: 'relative', width: '100%' }}>
        {/* An opaque band, edge to edge. The stamp lands over whatever the
            scene was showing — a heading, a photo — and a band that merely
            hugged the text would slice that content mid-glyph. It is NOT
            rotated: a tilted band leaves triangles of the old scene in the
            corners. */}
        <div
          style={{
            position: 'absolute',
            top: -52 * u,
            bottom: -52 * u,
            left: '-100%',
            right: '-100%',
            background: theme.bg_from,
            opacity: enter,
          }}
        />
        <div
          style={{
            position: 'relative',
            textAlign: 'center',
            transform: `rotate(-2.4deg) scale(${interpolate(enter, [0, 1], [1.55, 1])}) translate(${shakeX}px, ${shakeY}px)`,
            opacity: enter,
          }}
        >
          {/* Impact ring — motion, not chrome: it exists for four frames. */}
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
              height: 8 * u,
              width: `${interpolate(enter, [0, 1], [0, 64])}%`,
              margin: `${20 * u}px auto 0`,
              background: theme.accent,
            }}
          />
        </div>
      </div>
    );
  } else if (style === 'quote') {
    inner = (
      <div
        style={{
          ...surfaceStyle(theme),
          display: 'flex',
          alignItems: 'center',
          padding: `${30 * u}px ${48 * u}px`,
          // In slides mode the quote lands on a panel of its own colour, so the
          // hairline from surfaceStyle is what gives it an edge at all.
          borderLeft: `${8 * u}px solid ${theme.accent}`,
          transform: `translateX(${interpolate(enter, [0, 1], [-46 * u, 0])}px)`,
          opacity: enter,
        }}
      >
        <div
          style={{
            fontSize: 48 * u,
            fontWeight: 700,
            fontStyle: 'italic',
            lineHeight: 1.3,
            fontFamily: 'Georgia, Cambria, serif',
          }}
        >
          {words}
        </div>
      </div>
    );
  } else {
    // The PUNCH CARD: a flat, solid accent field with ink-toned karaoke type
    // and a rule that fills as the narrator works the line. Nothing else.
    inner = (
      <div
        style={{
          padding: `${34 * u}px ${56 * u}px ${30 * u}px`,
          background: theme.accent,
          transform: `translateY(${interpolate(enter, [0, 1], [36 * u, 0])}px) scale(${interpolate(enter, [0, 1], [0.94, 1])})`,
          opacity: enter,
        }}
      >
        <div
          style={{
            fontSize: 50 * u,
            fontWeight: 800,
            lineHeight: 1.22,
            letterSpacing: '-0.01em',
            fontFamily: displayFont,
            textAlign: 'center',
          }}
        >
          {words}
        </div>
        {/* Spoken-progress rule. */}
        <div style={{ position: 'relative', height: 5 * u, marginTop: 24 * u, background: `${cardInk}2e` }}>
          <div style={{ position: 'absolute', inset: 0, width: `${spokenProgress * 100}%`, background: cardInk }} />
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
      <div style={{ maxWidth: wrapMaxWidth, width: style === 'stamp' ? '84%' : undefined }}>{inner}</div>
    </div>
  );
};
