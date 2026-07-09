import React from 'react';
import { useVideoConfig, spring, interpolate } from 'remotion';
import { Slot, TextStyleVariant } from '../types';
import { useTheme, useDisplayFont, BODY_FONT, MONO_FONT, raise, hairline } from '../theme';
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

/**
 * Heading + bullet list — the workhorse text card, redesigned so no two
 * scenes present the same way. Every scene gets a PERSONALITY (assigned by
 * the backend scene stylist, seeded fallback otherwise):
 *
 *  - "editorial"  kicker + heading + numbered pill rows (the refined classic);
 *  - "statement"  hero-centered: huge gradient-highlighted heading, bullets
 *                 as centered chips underneath;
 *  - "numbered"   oversized gradient index digits (01/02/03) beside each point;
 *  - "checklist"  points check themselves off with a drawn-on tick;
 *  - "cards"      points as a row of mini-cards that pop in one by one.
 *
 * Plus: an eyebrow "kicker" line, accent-gradient keyword highlights in the
 * heading, a giant translucent scene numeral behind the copy (frameless
 * regions), and a soft pop sound as each point lands.
 *
 * Surfaces are unchanged in spirit: slides mode keeps the themed panel,
 * frameless canvas regions get the soft plate (NO backdrop-filter — glass
 * blur inside the camera-scaled world is exactly the text-softening bug),
 * `compact` renders the banner chip strip.
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
  const bullets = slot.bullets ?? [];
  const sequential = (slot.reveal ?? 'sequential') === 'sequential';
  // Frameless canvas regions get the soft plate instead of the slides panel.
  const plated = !transparent && !compact && region.frameless;
  const bare = transparent || region.frameless;

  const seed = (win?.start ?? 0) + bullets.length * 13 + meta.index * 7;
  const fromLeft = seeded(seed, 3) > 0.35; // most scenes slide in from the left
  const accentCornerRight = seeded(seed, 4) > 0.5;

  const headingIn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.6) });

  const startAt = Math.round(durationInFrames * 0.12);
  const endAt = Math.round(durationInFrames * 0.92);
  const step = bullets.length > 0 ? (endAt - startAt) / bullets.length : 0;

  // ---- Personality ----------------------------------------------------------
  const longest = bullets.reduce((m, b) => Math.max(m, b.length), 0);
  const allowed = (v: TextStyleVariant): boolean => {
    switch (v) {
      case 'statement':
        return !transparent && !!slot.heading && bullets.length <= 3 && longest <= 52;
      case 'cards':
        return !transparent && bullets.length >= 2 && bullets.length <= 4 && longest <= 72;
      case 'numbered':
        return bullets.length >= 2;
      case 'checklist':
        return bullets.length >= 2 && longest <= 90;
      default:
        return true;
    }
  };
  const pool: TextStyleVariant[] = (['statement', 'cards', 'numbered', 'checklist', 'editorial'] as TextStyleVariant[]).filter(allowed);
  const requested = meta.style?.variant;
  const variant: TextStyleVariant =
    requested && allowed(requested) ? requested : pool[Math.floor(seeded(seed, 6) * pool.length)] ?? 'editorial';

  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
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

  const kickerRow = kicker ? (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16 * u,
        marginBottom: 20 * u,
        opacity: headingIn,
        justifyContent: variant === 'statement' ? 'center' : 'flex-start',
      }}
    >
      <div
        style={{
          width: 34 * u,
          height: 5 * u,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`,
        }}
      />
      <span
        style={{
          fontSize: 23 * u,
          fontWeight: 700,
          letterSpacing: 5 * u,
          textTransform: 'uppercase',
          color: theme.accent,
          fontFamily: MONO_FONT,
        }}
      >
        {kicker}
      </span>
      {variant === 'statement' ? (
        <div
          style={{
            width: 34 * u,
            height: 5 * u,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${theme.accent2}, ${theme.accent})`,
          }}
        />
      ) : null}
    </div>
  ) : null;

  const headingSize = variant === 'statement' ? ((slot.heading ?? '').length > 38 ? 76 : 94) : 68;
  const headingNode = slot.heading ? (
    <div
      style={{
        opacity: headingIn,
        transform: `translateY(${interpolate(headingIn, [0, 1], [22 * u, 0])}px)`,
        textAlign: variant === 'statement' ? 'center' : 'left',
      }}
    >
      {kickerRow ??
        (variant !== 'statement' ? (
          <div
            style={{
              width: 64 * u,
              height: 6 * u,
              borderRadius: 999,
              marginBottom: 22 * u,
              background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`,
            }}
          />
        ) : null)}
      <h1
        style={{
          fontSize: headingSize * u,
          margin: `0 0 ${(variant === 'statement' ? 30 : 36) * u}px 0`,
          fontWeight: 900,
          lineHeight: 1.06,
          letterSpacing: -0.5 * u,
          color: theme.text,
          fontFamily: displayFont,
        }}
      >
        <KineticText text={slot.heading} delay={Math.round(fps * 0.15)} highlight={highlight} />
      </h1>
    </div>
  ) : null;

  /** Enter spring for point i. */
  const pointEnter = (i: number): number => {
    const appearFrame = Math.round(sequential ? startAt + step * i : startAt);
    const enter = spring({
      frame: frame - appearFrame,
      fps,
      config: { damping: 200 },
      durationInFrames: Math.round(fps * 0.5),
    });
    return sequential ? enter : 1;
  };

  // ---- Compact banner strip: heading + bullets as inline chips -------------
  if (compact) {
    return (
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 16 * u,
          fontFamily: BODY_FONT,
          color: theme.text,
        }}
      >
        {slot.heading ? (
          <div style={{ opacity: headingIn, display: 'flex', alignItems: 'center', gap: 20 * u }}>
            <div
              style={{
                width: 10 * u,
                height: 42 * u,
                borderRadius: 999,
                background: `linear-gradient(180deg, ${theme.accent}, ${theme.accent2})`,
                flexShrink: 0,
              }}
            />
            <h1 style={{ fontSize: 52 * u, margin: 0, fontWeight: 800, lineHeight: 1.05, fontFamily: displayFont }}>
              <KineticText text={slot.heading} delay={Math.round(fps * 0.15)} highlight={highlight} />
            </h1>
          </div>
        ) : null}
        {bullets.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 * u }}>
            {bullets.slice(0, 4).map((bullet, i) => {
              const enter = pointEnter(i);
              return (
                <div
                  key={i}
                  style={{
                    padding: `${10 * u}px ${22 * u}px`,
                    borderRadius: 999,
                    background: raise(theme, 0.07),
                    border: `1px solid ${hairline(theme, 0.12)}`,
                    fontSize: 30 * u,
                    fontWeight: 600,
                    opacity: enter,
                    transform: `translateY(${interpolate(enter, [0, 1], [14 * u, 0])}px)`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12 * u,
                  }}
                >
                  <span
                    style={{
                      width: 10 * u,
                      height: 10 * u,
                      borderRadius: 999,
                      flexShrink: 0,
                      background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
                    }}
                  />
                  {bullet}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  // ---- Point renderers, one per personality ---------------------------------

  const editorialPoints = (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {bullets.map((bullet, i) => {
        const enter = pointEnter(i);
        const slide = interpolate(enter, [0, 1], [fromLeft ? -34 * u : 34 * u, 0]);
        return (
          <li
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 20 * u,
              fontSize: 44 * u,
              lineHeight: 1.32,
              marginBottom: 18 * u,
              opacity: enter,
              transform: `translateX(${slide}px)`,
              // Each revealed point sits on its own soft pill, so what is
              // being "shown" always has a backdrop of its own.
              padding: plated || bare ? `${14 * u}px ${20 * u}px` : `0 0 ${8 * u}px 0`,
              borderRadius: 20 * u,
              background: plated || bare ? raise(theme, 0.045) : 'transparent',
              border: plated || bare ? `1px solid ${hairline(theme, 0.07)}` : 'none',
            }}
          >
            <span
              style={{
                marginTop: 8 * u,
                minWidth: 40 * u,
                height: 40 * u,
                borderRadius: 12 * u,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24 * u,
                fontWeight: 900,
                color: theme.bg_from,
                background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
                fontFamily: displayFont,
              }}
            >
              {i + 1}
            </span>
            <span>{bullet}</span>
          </li>
        );
      })}
    </ul>
  );

  const statementPoints = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 * u, justifyContent: 'center' }}>
      {bullets.map((bullet, i) => {
        const enter = pointEnter(i);
        return (
          <div
            key={i}
            style={{
              padding: `${14 * u}px ${30 * u}px`,
              borderRadius: 999,
              background: raise(theme, 0.06),
              border: `1px solid ${hairline(theme, 0.12)}`,
              fontSize: 34 * u,
              fontWeight: 650,
              display: 'flex',
              alignItems: 'center',
              gap: 14 * u,
              opacity: enter,
              transform: `translateY(${interpolate(enter, [0, 1], [18 * u, 0])}px) scale(${interpolate(enter, [0, 1], [0.92, 1])})`,
            }}
          >
            <span
              style={{
                width: 12 * u,
                height: 12 * u,
                borderRadius: 999,
                flexShrink: 0,
                background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
                boxShadow: `0 0 ${14 * u}px ${theme.accent}66`,
              }}
            />
            {bullet}
          </div>
        );
      })}
    </div>
  );

  const numberedPoints = (
    <div>
      {bullets.map((bullet, i) => {
        const enter = pointEnter(i);
        const slide = interpolate(enter, [0, 1], [fromLeft ? -40 * u : 40 * u, 0]);
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 26 * u,
              padding: `${16 * u}px 0`,
              borderBottom: i < bullets.length - 1 ? `1px solid ${hairline(theme, 0.09)}` : 'none',
              opacity: enter,
              transform: `translateX(${slide}px)`,
            }}
          >
            <span
              style={{
                fontSize: 84 * u,
                fontWeight: 900,
                lineHeight: 1,
                fontFamily: displayFont,
                backgroundImage: `linear-gradient(160deg, ${theme.accent}, ${theme.accent2})`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                minWidth: 104 * u,
                flexShrink: 0,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{ fontSize: 42 * u, lineHeight: 1.3 }}>{bullet}</span>
          </div>
        );
      })}
    </div>
  );

  const checkPoints = (
    <div>
      {bullets.map((bullet, i) => {
        const enter = pointEnter(i);
        const draw = interpolate(enter, [0.25, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const r = 26;
        const circ = 2 * Math.PI * r;
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 22 * u,
              marginBottom: 20 * u,
              padding: `${12 * u}px ${18 * u}px`,
              borderRadius: 18 * u,
              background: bare ? raise(theme, 0.045) : 'transparent',
              border: bare ? `1px solid ${hairline(theme, 0.07)}` : 'none',
              opacity: enter,
              transform: `translateY(${interpolate(enter, [0, 1], [16 * u, 0])}px)`,
            }}
          >
            <svg width={60 * u} height={60 * u} viewBox="0 0 60 60" style={{ flexShrink: 0 }}>
              <circle cx="30" cy="30" r={r} fill={`${theme.accent}1a`} stroke={theme.accent} strokeWidth="3.5"
                strokeDasharray={circ} strokeDashoffset={circ * (1 - draw)} strokeLinecap="round"
                transform="rotate(-90 30 30)" />
              <path d="M18 31 L27 40 L43 22" fill="none" stroke={theme.accent2} strokeWidth="5.5"
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={40} strokeDashoffset={40 * (1 - draw)} />
            </svg>
            <span style={{ fontSize: 42 * u, lineHeight: 1.3 }}>{bullet}</span>
          </div>
        );
      })}
    </div>
  );

  const cardPoints = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22 * u, alignItems: 'stretch' }}>
      {bullets.map((bullet, i) => {
        const enter = pointEnter(i);
        const basis = bullets.length <= 3 ? `${100 / bullets.length - 3}%` : '46%';
        return (
          <div
            key={i}
            style={{
              flex: `1 1 ${basis}`,
              minWidth: 0,
              boxSizing: 'border-box',
              padding: `${26 * u}px ${26 * u}px`,
              borderRadius: 26 * u,
              background: `linear-gradient(165deg, ${raise(theme, 0.085)}, ${raise(theme, 0.02)}), ${theme.panel}`,
              border: `1px solid ${hairline(theme, 0.12)}`,
              boxShadow: `inset 0 1px 0 ${hairline(theme, 0.12)}, 0 ${18 * u}px ${50 * u}px rgba(0,0,0,0.35)`,
              opacity: enter,
              transform: `translateY(${interpolate(enter, [0, 1], [30 * u, 0])}px) scale(${interpolate(enter, [0, 1], [0.9, 1])})`,
            }}
          >
            <div
              style={{
                width: 46 * u,
                height: 46 * u,
                borderRadius: 14 * u,
                marginBottom: 18 * u,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26 * u,
                fontWeight: 900,
                color: theme.bg_from,
                background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
                boxShadow: `0 0 ${20 * u}px ${theme.accent}55`,
                fontFamily: displayFont,
              }}
            >
              {i + 1}
            </div>
            <div style={{ fontSize: 33 * u, lineHeight: 1.34, fontWeight: 600 }}>{bullet}</div>
          </div>
        );
      })}
    </div>
  );

  const points =
    variant === 'statement'
      ? statementPoints
      : variant === 'numbered'
        ? numberedPoints
        : variant === 'checklist'
          ? checkPoints
          : variant === 'cards'
            ? cardPoints
            : editorialPoints;

  const content = (
    <div style={{ position: 'relative', zIndex: 1 }}>
      {!slot.heading && kicker ? kickerRow : null}
      {headingNode}
      {points}
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
        alignItems: variant === 'statement' ? 'center' : 'stretch',
        padding: plated ? '7%' : '8%',
        boxSizing: 'border-box',
        position: 'relative',
        background: plated
          ? `linear-gradient(160deg, ${raise(theme, 0.05)}, ${raise(theme, 0.012)}), ${theme.panel}`
          : bare
            ? 'transparent'
            : theme.panel,
        border: plated ? `1px solid ${hairline(theme, 0.1)}` : 'none',
        borderRadius: plated ? 40 : 0,
        boxShadow: plated
          ? `inset 0 1px 0 ${hairline(theme, 0.12)}, 0 34px 90px rgba(0,0,0,0.42)`
          : 'none',
        backdropFilter: bare || plated ? undefined : 'blur(6px)',
        fontFamily: BODY_FONT,
        color: theme.text,
        overflow: plated ? 'hidden' : undefined,
      }}
    >
      {/* Accent corner glow anchors the plate to the theme (seeded corner). */}
      {plated ? (
        <div
          style={{
            position: 'absolute',
            width: '52%',
            height: '52%',
            top: '-18%',
            [accentCornerRight ? 'right' : 'left']: '-14%',
            background: `radial-gradient(50% 50% at 50% 50%, ${theme.accent}26, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {/* Giant editorial numeral: the scene's index as a poster watermark. */}
      {region.frameless && !transparent ? (
        <div
          style={{
            position: 'absolute',
            [accentCornerRight ? 'left' : 'right']: '-2%',
            bottom: '-14%',
            fontSize: 480 * u,
            lineHeight: 1,
            fontWeight: 900,
            fontFamily: displayFont,
            color: theme.text,
            opacity: 0.05,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {String(meta.index + 1).padStart(2, '0')}
        </div>
      ) : null}
      {content}
    </div>
  );
};
