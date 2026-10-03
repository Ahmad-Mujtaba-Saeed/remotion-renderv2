import React from 'react';
import { useVideoConfig, spring, interpolate } from 'remotion';
import { useDepthRows } from '../motion/depthStage';
import { Slot, TextStyleVariant } from '../types';
import { useTheme, useDisplayFont, useSkin, BODY_FONT, MONO_FONT, hairline } from '../theme';
import { surfaceStyle } from './Surface';
import { clamp01, easeOutCubic } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { beatFrames } from '../motion/narrationBeats';
import { useMotionStyle } from '../motion/styles';
import { KineticText } from './KineticText';
import { useScaleUnit } from '../responsive';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useRegionStyle } from '../canvas/RegionStyle';
import { useSceneMeta } from './SceneMeta';
import { fitText, fitGroup, lineCount } from '../typography';
import { editId, useEdit, useSlotKey } from './Editable';

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
export const TextBlock: React.FC<{
  slot: Slot;
  transparent?: boolean;
  compact?: boolean;
  /**
   * The share of the frame's width this text actually gets, so the type can be
   * solved against its real column. Layouts know their own geometry (a side
   * panel is a third of the frame, a split half is a half); the default suits
   * a full-width text scene inside the usual ~6% padding.
   *
   * A fraction rather than pixels on purpose: the canvas journey and the math
   * board render these layouts at DESIGN resolution and scale the result, so
   * the frame is always the right basis.
   */
  columnFrac?: number;
  /** Share of the frame's HEIGHT the block's box gets (for the height budget). */
  heightFrac?: number;
}> = ({ slot, transparent, compact, columnFrac = 0.86, heightFrac = 0.86 }) => {
  // Rows arrive out of depth and resolve exactly where they landed before
  // (motion/depthStage). At `motion_depth: off` this is the identity.
  const depthRow = useDepthRows();
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const { fps, width: frameW, height: frameH } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();
  const win = useSceneWindow();
  const u = useScaleUnit();
  const region = useRegionStyle();
  const meta = useSceneMeta();
  const skin = useSkin();
  const edit = useEdit();
  const slotKey = useSlotKey(slot);
  const idOf = (field: string): string => editId(slotKey, field);
  // Hand-edited wording (display only) replaces the card's own before any
  // type is solved, so the fit is measured on what is actually drawn.
  const headingText = edit.text(idOf('heading'), slot.heading ?? '');
  const bullets = (slot.bullets ?? []).map((b, i) => edit.text(idOf(`bullets.${i}`), b));
  /** A bullet recoloured by hand keeps that colour through the dimming. */
  const recoloured = (i: number): boolean => Boolean(edit.get(idOf(`bullets.${i}`))?.color);
  const sequential = (slot.reveal ?? 'sequential') === 'sequential';
  /** Canvas regions and explicit overlays paint straight onto the field. */
  const bare = transparent || region.frameless;

  const seed = (win?.start ?? 0) + bullets.length * 13 + meta.index * 7;

  const headingIn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.6) });

  /*
   * PACING: the rows land on the VOICE, not on a metronome.
   *
   * The old spread put row i at 12% + i/n of the scene, so on a beat where the
   * narrator lingers on point one and rushes points two and three, the frame
   * and the sentence drifted apart — and the scene's last visible change came
   * at a fixed 92% whatever was being said. `beatFrames` assigns each row the
   * moment its share of the narration begins and clamps the result (never
   * before the heading settles, never two rows on adjacent frames, never so
   * late the row cannot be read). With no word timings it returns exactly the
   * even spread this card always used, so those renders do not move.
   */
  const startAt = Math.round(durationInFrames * 0.12);
  const endAt = Math.round(durationInFrames * 0.92);
  const landAt = beatFrames(meta.words ?? undefined, bullets.length, fps, {
    first: startAt,
    last: endAt,
    minGap: f30(fps, 10),
    texts: bullets,
  });

  // ---- Look -----------------------------------------------------------------
  const longest = bullets.reduce((m, b) => Math.max(m, b.length), 0);
  const statementFits = !transparent && !!headingText && bullets.length <= 3 && longest <= 52;
  const asLook = (v?: TextStyleVariant): Look | undefined =>
    v === undefined ? undefined : v === 'statement' ? 'statement' : 'editorial';

  const requested = asLook(meta.style?.variant);
  const look: Look =
    requested === 'statement' && !statementFits
      ? 'editorial'
      : (requested ?? (statementFits && seeded(seed, 6) > 0.5 ? 'statement' : 'editorial'));
  const centered = look === 'statement';

  const kicker = edit.text(idOf('kicker'), (meta.style?.kicker ?? slot.label ?? '').trim());
  const index = String(meta.index + 1).padStart(2, '0');
  // Highlight: stylist's picks, or (when the stylist never ran) the longest
  // meaty word so headings still get a focal point. An explicit [] means none.
  const highlight =
    meta.style?.highlight ??
    (() => {
      const words = headingText.split(/\s+/).filter((w) => w.replace(/[^a-zA-Z0-9]/g, '').length >= 5);
      if (!words.length) return [];
      return [words.reduce((a, b) => (b.length > a.length ? b : a))];
    })();

  /*
   * Type is SOLVED, not chosen: fitText measures the real face and returns
   * the biggest size that fits the line budget.
   *
   * `columnFrac` is the TEXT column, this block's own padding already taken
   * off by the caller (every layout's number has it baked in). The side panel
   * used to pass its outer box, which put 70px headings into ~420px of line:
   * four-line headings and a panel taller than the frame (project 211).
   */
  const padFrac = bare ? 0.07 : 0.08;
  const column = frameW * columnFrac;
  /*
   * DENSE: a column under ~620px (a docked side panel, a split half on a
   * narrow frame) cannot carry the full-width rhythm — 34px numerals, a 108px
   * gutter and 26px row padding eat a third of it. Same design, smaller
   * metrics, and the heading may take a third line instead of shrinking to a
   * size that no longer reads as a heading.
   */
  const dense = column < 620 * u;
  const m = dense
    ? { gutter: 60 * u, numeral: 24 * u, numeralW: 40 * u, gap: 16 * u, rowPad: 15 * u, headMax: 54, headMin: 32, headLines: 3, bMax: 32, bMin: 21, kicker: 17 * u, kickerGap: 16 * u, headGap: 24 * u }
    : { gutter: 108 * u, numeral: 34 * u, numeralW: 78 * u, gap: 30 * u, rowPad: 26 * u, headMax: centered ? 100 : 70, headMin: centered ? 46 : 38, headLines: centered ? 3 : 2, bMax: 44, bMin: 24, kicker: 21 * u, kickerGap: 26 * u, headGap: (centered ? 44 : 40) * u };
  const headingFit = {
    width: column,
    max: m.headMax * u,
    min: m.headMin * u,
    maxLines: m.headLines,
    font: displayFont,
    weight: 900,
    letterSpacing: -1 * u,
  };
  let headingSize = fitText(headingText, headingFit) / u;

  /*
   * Bullets take ONE size for the whole list — a list whose rows each pick
   * their own size reads as a ransom note — solved from the longest row. The
   * numeral column and its gap come off the width first, and a long list gets
   * a tighter ceiling because it also has to fit VERTICALLY.
   */
  const rows = bullets.length;
  const bulletFit = {
    width: column - m.gutter,
    max: (dense ? m.bMax : rows > 4 ? 36 : rows > 3 ? 40 : 44) * u,
    min: m.bMin * u,
    maxLines: dense ? 3 : rows > 3 ? 1 : 2,
    font: BODY_FONT,
    weight: 400,
    kinetic: false,
  };
  let bulletSize = fitGroup(bullets, bulletFit);
  const statementBulletSize = fitGroup(bullets, {
    width: column * 0.92,
    max: 38 * u,
    min: 24 * u,
    maxLines: 2,
    font: BODY_FONT,
    weight: 400,
  });

  /*
   * HEIGHT BUDGET. Width fitting alone let a long heading plus three wrapped
   * rows stand taller than the frame. Estimate the stack with the solver's own
   * wrap and, when it overflows the box this block owns, scale heading and
   * rows down together (never below 80% of their floors).
   */
  const budget = frameH * heightFrac * (1 - 2 * padFrac);
  let rowPad = m.rowPad;
  for (let pass = 0; pass < 8 && !centered; pass++) {
    const hLines = headingText ? lineCount(headingText, headingSize * u, headingFit) : 0;
    const est =
      m.kicker * 1.3 + m.kickerGap +
      hLines * headingSize * u * 1.04 + (headingText ? m.headGap : 0) +
      bullets.reduce((sum, b) => sum + lineCount(b, bulletSize, bulletFit) * bulletSize * 1.32 + 2 * rowPad, 0);
    if (est <= budget) break;
    headingSize = Math.max(m.headMin * 0.8, headingSize * 0.93);
    bulletSize = Math.max(m.bMin * 0.8 * u, bulletSize * 0.93);
    rowPad = Math.max(8 * u, rowPad * 0.85);
  }

  // ---- Shared pieces --------------------------------------------------------

  const rule = (alpha = 0.14): string => hairline(theme, alpha);

  /** Eyebrow: scene numeral, a short accent tick, then the label. */
  const kickerRow = (
    <div
      {...edit(idOf('kicker'), {
        display: 'flex',
        alignItems: 'center',
        gap: 14 * u,
        marginBottom: m.kickerGap,
        opacity: headingIn,
        justifyContent: centered ? 'center' : 'flex-start',
        fontFamily: MONO_FONT,
        fontSize: m.kicker,
        fontWeight: 600,
        letterSpacing: 4 * u,
        textTransform: 'uppercase',
      })}
    >
      <span style={{ color: theme.muted }}>{index}</span>
      <div style={{ width: 28 * u, height: 3 * u, background: theme.accent, flexShrink: 0 }} />
      {kicker ? <span style={{ color: theme.accent }}>{kicker}</span> : null}
    </div>
  );

  const headingNode = headingText ? (
    <div
      style={{
        opacity: headingIn,
        transform: `translateY(${interpolate(headingIn, [0, 1], [22 * u, 0])}px)`,
        textAlign: centered ? 'center' : 'left',
      }}
    >
      {kickerRow}
      <h1
        {...edit(idOf('heading'), {
          fontSize: headingSize * u,
          margin: `0 0 ${m.headGap}px 0`,
          fontWeight: 900,
          lineHeight: 1.04,
          letterSpacing: -1 * u,
          color: theme.text,
          fontFamily: displayFont,
        })}
      >
        <KineticText text={headingText} delay={Math.round(fps * 0.15)} highlight={highlight} />
      </h1>
    </div>
  ) : null;

  /** Entrance progress for point i — pace and curve come from the motion
      style (§2.5), so bullets land snappy in `swiss` and glide in `classic`.
      A back-eased style may briefly exceed 1 (the overshoot). */
  const motion = useMotionStyle();
  const pointEnter = (i: number): number => {
    if (!sequential) return 1;
    return motion.ease(clamp01((frame - landAt[i]) / f30(fps, motion.baseF + 4)));
  };

  /**
   * Progress dimming (copilot.md §4.6): once the NEXT bullet arrives, this
   * one eases back to the muted tone at 45% presence over 8 frames — the eye
   * stays locked to the point the voice is on. The last bullet never dims.
   */
  const pointDim = (i: number): number => {
    if (!sequential || i >= bullets.length - 1) return 0;
    return easeOutCubic(clamp01((frame - landAt[i + 1]) / f30(fps, 8)));
  };

  /**
   * THE TRACKER (iter 61): how much row i is the row the voice is ON.
   *
   * Dimming already tells you which rows are behind you. This is the other
   * half — the active row is marked, so the frame keeps changing all the way
   * through the narration instead of settling once the last bullet has landed.
   * It rises as the row arrives and falls as the next one does, which means
   * something on screen is in motion at every moment of the scene.
   */
  const pointActive = (i: number): number => {
    if (!sequential) return 0;
    const inP = easeOutCubic(clamp01((frame - landAt[i]) / f30(fps, 9)));
    const out = i < bullets.length - 1
      ? easeOutCubic(clamp01((frame - landAt[i + 1]) / f30(fps, 9)))
      : 0;
    return inP * (1 - out);
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
        {headingText ? (
          <div style={{ opacity: headingIn, display: 'flex', alignItems: 'center', gap: 20 * u }}>
            <div style={{ width: 6 * u, height: 44 * u, background: theme.accent, flexShrink: 0 }} />
            <h1 {...edit(idOf('heading'), { fontSize: 52 * u, margin: 0, fontWeight: 800, lineHeight: 1.05, fontFamily: displayFont })}>
              <KineticText text={headingText} delay={Math.round(fps * 0.15)} highlight={highlight} />
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
                  {...edit(idOf(`bullets.${i}`), {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14 * u,
                    fontSize: 30 * u,
                    fontWeight: 600,
                    opacity: enter,
                    ...depthRow(enter, `translateY(${interpolate(enter, [0, 1], [14 * u, 0])}px)`),
                  })}
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
        const active = pointActive(i);
        return (
          <li
            key={i}
            {...edit(idOf(`bullets.${i}`), {
              position: 'relative',
              display: 'flex',
              alignItems: 'baseline',
              gap: m.gap,
              fontSize: bulletSize,
              lineHeight: 1.32,
              padding: `${rowPad}px 0`,
              opacity: enter * (1 - 0.3 * dim),
              ...depthRow(enter, `translateY(${interpolate(enter, [0, 1], [16 * u, 0])}px)`),
            })}
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
            {/* The tracker: a solid accent bar in the numeral gutter that
                grows on the row the narrator is on and retracts as they move
                down the list. Absolutely positioned and scaled on Y, so it
                needs no measurement and adds no layout — the row's own height
                is the bar's height. Flat law: a solid rule, nothing else. */}
            <div
              style={{
                position: 'absolute',
                left: (dense ? -10 : -18) * u,
                top: rowPad * 0.55,
                bottom: rowPad * 0.55,
                width: 4 * u,
                background: theme.accent,
                transformOrigin: 'center',
                transform: `scaleY(${active})`,
                opacity: active,
              }}
            />
            <span
              style={{
                minWidth: m.numeralW,
                flexShrink: 0,
                fontSize: m.numeral,
                fontWeight: 700,
                fontFamily: MONO_FONT,
                fontVariantNumeric: 'tabular-nums',
                // The numeral leads the row: full accent while the voice is
                // here, muted once it has moved on.
                color: active > 0.5 ? theme.accent : theme.muted,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{ flex: 1, color: dim > 0.35 && !recoloured(i) ? theme.muted : undefined }}>{bullet}</span>
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
        const active = pointActive(i);
        return (
          <div
            key={i}
            {...edit(idOf(`bullets.${i}`), {
              position: 'relative',
              padding: `${24 * u}px 0`,
              textAlign: 'center',
              fontSize: statementBulletSize,
              lineHeight: 1.3,
              fontWeight: 600,
              opacity: enter * (1 - 0.3 * dim),
              color: dim > 0.35 && !recoloured(i) ? theme.muted : undefined,
              ...depthRow(enter, `translateY(${interpolate(enter, [0, 1], [16 * u, 0])}px)`),
            })}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 1,
                // The active line's rule turns accent and runs its full
                // width; the rest stay hairlines. Centred copy has no gutter
                // for a tracker bar, so the separator does the marking.
                background: active > 0.5 ? theme.accent : rule(),
                transformOrigin: 'center',
                transform: `scaleX(${
                  interpolate(enter, [0.15, 1], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }) * (0.34 + 0.66 * active)
                })`,
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
      {!headingText ? kickerRow : null}
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
