import React from 'react';
import { useVideoConfig, spring, interpolate } from 'remotion';
import { Slot, TextStyleVariant } from '../types';
import { useTheme, useDisplayFont, useSkin, BODY_FONT, MONO_FONT, hairline } from '../theme';
import { surfaceStyle } from './Surface';
import { clamp01, easeOutCubic } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { useMotionStyle } from '../motion/styles';
import { KineticText } from './KineticText';
import { useScaleUnit } from '../responsive';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useRegionStyle } from '../canvas/RegionStyle';
import { useSceneMeta } from './SceneMeta';

/** Deterministic per-scene variation seed (scene windows differ per scene). */
const seeded = (n: number, salt: number): number => {
  const v = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** The two ways a text scene can present itself. */
type Look = 'editorial' | 'statement';

/**
 * Heading + bullet list — the workhorse text scene.
 *
 * There are exactly two looks, because five was four too many:
 *
 *  - "editorial"  kicker, heading, then rows hung off big accent numerals and
 *                 separated by hairline rules that draw in from the left;
 *  - "statement"  a centered hero heading over a short centered list — for
 *                 scenes with one big idea and few, short points.
 *
 * The backend stylist still emits the old five variant names; `numbered`,
 * `checklist` and `cards` all resolve to `editorial` (they were the same
 * information wearing different jewellery).
 *
 * Surfaces: none. Rows sit directly on the scene's flat colour field,
 * separated by rules rather than enclosed in boxes. Slides mode keeps its solid
 * `theme.panel` because there the panel *is* the slide. No gradients, no glass,
 * no drop shadows — and specifically no `filter`/`backdrop-filter` anywhere,
 * since inside the camera-scaled canvas world that is what softens the text.
 */
export const TextBlock: React.FC<{ slot: Slot; transparent?: boolean; compact?: boolean }> = ({
  slot,
  transparent,
  compact,
}) => {
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const { fps } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();
  const win = useSceneWindow();
  const u = useScaleUnit();
  const region = useRegionStyle();
  const meta = useSceneMeta();
  const skin = useSkin();
  const bullets = slot.bullets ?? [];
  const sequential = (slot.reveal ?? 'sequential') === 'sequential';
  /** Canvas regions and explicit overlays paint straight onto the field. */
  const bare = transparent || region.frameless;

  const seed = (win?.start ?? 0) + bullets.length * 13 + meta.index * 7;

  const headingIn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.6) });

  const startAt = Math.round(durationInFrames * 0.12);
  const endAt = Math.round(durationInFrames * 0.92);
  const step = bullets.length > 0 ? (endAt - startAt) / bullets.length : 0;

  // ---- Look -----------------------------------------------------------------
  const longest = bullets.reduce((m, b) => Math.max(m, b.length), 0);
  const statementFits = !transparent && !!slot.heading && bullets.length <= 3 && longest <= 52;
  const asLook = (v?: TextStyleVariant): Look | undefined =>
    v === undefined ? undefined : v === 'statement' ? 'statement' : 'editorial';

  const requested = asLook(meta.style?.variant);
  const look: Look =
    requested === 'statement' && !statementFits
      ? 'editorial'
      : (requested ?? (statementFits && seeded(seed, 6) > 0.5 ? 'statement' : 'editorial'));
  const centered = look === 'statement';

  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const index = String(meta.index + 1).padStart(2, '0');
  // Highlight: stylist's picks, or (when the stylist never ran) the longest
  // meaty word so headings still get a focal point. An explicit [] means none.
  const highlight =
    meta.style?.highlight ??
    (() => {
      const words = (slot.heading ?? '').split(/\s+/).filter((w) => w.replace(/[^a-zA-Z0-9]/g, '').length >= 5);
      if (!words.length) return [];
      return [words.reduce((a, b) => (b.length > a.length ? b : a))];
    })();

  // ---- Shared pieces --------------------------------------------------------

  const rule = (alpha = 0.14): string => hairline(theme, alpha);

  /** Eyebrow: scene numeral, a short accent tick, then the label. */
  const kickerRow = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14 * u,
        marginBottom: 26 * u,
        opacity: headingIn,
        justifyContent: centered ? 'center' : 'flex-start',
        fontFamily: MONO_FONT,
        fontSize: 21 * u,
        fontWeight: 600,
        letterSpacing: 4 * u,
        textTransform: 'uppercase',
      }}
    >
      <span style={{ color: theme.muted }}>{index}</span>
      <div style={{ width: 28 * u, height: 3 * u, background: theme.accent, flexShrink: 0 }} />
      {kicker ? <span style={{ color: theme.accent }}>{kicker}</span> : null}
    </div>
  );

  const headingSize = centered ? ((slot.heading ?? '').length > 38 ? 82 : 100) : 70;
  const headingNode = slot.heading ? (
    <div
      style={{
        opacity: headingIn,
        transform: `translateY(${interpolate(headingIn, [0, 1], [22 * u, 0])}px)`,
        textAlign: centered ? 'center' : 'left',
      }}
    >
      {kickerRow}
      <h1
        style={{
          fontSize: headingSize * u,
          margin: `0 0 ${(centered ? 44 : 40) * u}px 0`,
          fontWeight: 900,
          lineHeight: 1.04,
          letterSpacing: -1 * u,
          color: theme.text,
          fontFamily: displayFont,
        }}
      >
        <KineticText text={slot.heading} delay={Math.round(fps * 0.15)} highlight={highlight} />
      </h1>
    </div>
  ) : null;

  /** Entrance progress for point i — pace and curve come from the motion
      style (§2.5), so bullets land snappy in `swiss` and glide in `classic`.
      A back-eased style may briefly exceed 1 (the overshoot). */
  const motion = useMotionStyle();
  const pointEnter = (i: number): number => {
    if (!sequential) return 1;
    const appearFrame = Math.round(startAt + step * i);
    return motion.ease(clamp01((frame - appearFrame) / f30(fps, motion.baseF + 4)));
  };

  /**
   * Progress dimming (copilot.md §4.6): once the NEXT bullet arrives, this
   * one eases back to the muted tone at 45% presence over 8 frames — the eye
   * stays locked to the point the voice is on. The last bullet never dims.
   */
  const pointDim = (i: number): number => {
    if (!sequential || i >= bullets.length - 1) return 0;
    const nextAppear = Math.round(startAt + step * (i + 1));
    return easeOutCubic(clamp01((frame - nextAppear) / f30(fps, 8)));
  };

  // ---- Compact banner strip: heading + bullets as a rule-separated row ------
  if (compact) {
    return (
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 18 * u,
          fontFamily: BODY_FONT,
          color: theme.text,
        }}
      >
        {slot.heading ? (
          <div style={{ opacity: headingIn, display: 'flex', alignItems: 'center', gap: 20 * u }}>
            <div style={{ width: 6 * u, height: 44 * u, background: theme.accent, flexShrink: 0 }} />
            <h1 style={{ fontSize: 52 * u, margin: 0, fontWeight: 800, lineHeight: 1.05, fontFamily: displayFont }}>
              <KineticText text={slot.heading} delay={Math.round(fps * 0.15)} highlight={highlight} />
            </h1>
          </div>
        ) : null}
        {bullets.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${10 * u}px ${34 * u}px` }}>
            {bullets.slice(0, 4).map((bullet, i) => {
              const enter = pointEnter(i);
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14 * u,
                    fontSize: 30 * u,
                    fontWeight: 600,
                    opacity: enter,
                    transform: `translateY(${interpolate(enter, [0, 1], [14 * u, 0])}px)`,
                  }}
                >
                  <span style={{ width: 8 * u, height: 8 * u, background: theme.accent, flexShrink: 0 }} />
                  {bullet}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  // ---- Points ---------------------------------------------------------------

  /**
   * Rows hung off tabular accent numerals. The hairline above each row draws in
   * from the left as the row arrives — the separator is the animation, so the
   * row itself only has to fade and rise.
   */
  const editorialPoints = (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {bullets.map((bullet, i) => {
        const enter = pointEnter(i);
        const dim = pointDim(i);
        return (
          <li
            key={i}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'baseline',
              gap: 30 * u,
              fontSize: 44 * u,
              lineHeight: 1.32,
              padding: `${26 * u}px 0`,
              opacity: enter * (1 - 0.55 * dim),
              transform: `translateY(${interpolate(enter, [0, 1], [16 * u, 0])}px)`,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 1,
                background: rule(),
                transformOrigin: 'left center',
                transform: `scaleX(${interpolate(enter, [0.15, 1], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })})`,
              }}
            />
            <span
              style={{
                minWidth: 78 * u,
                flexShrink: 0,
                fontSize: 34 * u,
                fontWeight: 700,
                fontFamily: MONO_FONT,
                fontVariantNumeric: 'tabular-nums',
                color: theme.accent,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{ flex: 1, color: dim > 0.35 ? theme.muted : undefined }}>{bullet}</span>
          </li>
        );
      })}
    </ul>
  );

  /** Centered lines under a hero heading, separated by the same hairline. */
  const statementPoints = (
    <div style={{ width: '100%', maxWidth: 1180 * u }}>
      {bullets.map((bullet, i) => {
        const enter = pointEnter(i);
        const dim = pointDim(i);
        return (
          <div
            key={i}
            style={{
              position: 'relative',
              padding: `${24 * u}px 0`,
              textAlign: 'center',
              fontSize: 38 * u,
              lineHeight: 1.3,
              fontWeight: 600,
              opacity: enter * (1 - 0.55 * dim),
              color: dim > 0.35 ? theme.muted : undefined,
              transform: `translateY(${interpolate(enter, [0, 1], [16 * u, 0])}px)`,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 1,
                background: rule(),
                transformOrigin: 'center',
                transform: `scaleX(${interpolate(enter, [0.15, 1], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })})`,
              }}
            />
            {bullet}
          </div>
        );
      })}
    </div>
  );

  const content = (
    <div style={{ width: '100%' }}>
      {!slot.heading ? kickerRow : null}
      {headingNode}
      {centered ? statementPoints : editorialPoints}
    </div>
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: centered ? 'center' : 'stretch',
        padding: bare ? '7%' : '8%',
        boxSizing: 'border-box',
        // The slide's own field. flat keeps the opaque panel (byte-identical
        // to before); outline/print skins (§11.2) empty it and edge it.
        ...(bare
          ? { background: 'transparent' }
          : skin === 'flat'
            ? { background: theme.panel }
            : surfaceStyle(theme, skin, false)),
        fontFamily: BODY_FONT,
        color: theme.text,
      }}
    >
      {content}
    </div>
  );
};
