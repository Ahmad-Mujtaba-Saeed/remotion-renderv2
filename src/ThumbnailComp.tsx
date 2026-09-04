import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { Theme, DEFAULT_THEME } from './types';
import { ThemeProvider, DISPLAY_FONT, MONO_FONT, inkOn } from './theme';
import { FontLoader } from './fonts';
import { MathText } from './math/mathText';

export type ThumbnailLayout =
  | 'subject_left'
  | 'subject_right'
  | 'stat_hero'
  | 'question'
  | 'versus';

export interface ThumbnailProps {
  /** The hook — 2-5 words, already uppercased and clamped by the backend. */
  title?: string;
  /** One word OF the hook, blown up in the accent colour. */
  emphasis?: string;
  /** Small rotated sticker, e.g. "EXPLAINED" / "IN 2 MIN". */
  badge?: string;
  /** The striking number, e.g. "40,000 FT". Drives `stat_hero`. */
  stat?: string | null;
  layout?: ThumbnailLayout;
  vs_left?: string | null;
  vs_right?: string | null;
  kicker?: string;
  theme?: Theme | null;
  /** Hero image — ideally a BiRefNet cut-out (transparent PNG). */
  hero_url?: string | null;
  /** True when hero_url has a real alpha channel, so it can bleed the frame. */
  hero_cutout?: boolean;
  /** Math videos: the problem itself, typeset, instead of a picture. */
  equation?: string | null;
  font_pack?: string | null;
  width?: number;
  height?: number;
}

/**
 * ThumbnailComp — the still rendered after the video, designed to be clicked.
 *
 * The previous version set the project TITLE over a flat field beside a framed
 * picture. It was tidy and it was invisible: a title describes a video, and a
 * thumbnail has to interrupt someone. Everything here exists to buy attention
 * in the ~40ms a thumbnail gets at grid size, and each piece is doing one job:
 *
 *  - ONE hook of a few words, not a sentence. Set enormous, because the whole
 *    thing renders 210px wide in a sidebar and anything smaller is texture.
 *  - A stroked, shadowed word stack. A thumbnail sits on unknown backgrounds
 *    next to unknown neighbours; an outline is what keeps type readable when
 *    the image behind it turns pale.
 *  - ONE word in the accent, on a highlight slab. The eye lands there first,
 *    which is how you make three words read in order rather than at once.
 *  - A radial spotlight behind the subject and a diagonal wedge across the
 *    ground. Depth and diagonals both survive downscaling; flat panels do not.
 *  - A cut-out subject that BREAKS THE FRAME — oversized, bottom-anchored,
 *    overlapping the type. Depth again, and it is the single biggest
 *    difference between "a card with a photo on it" and a thumbnail.
 *  - Corner-to-corner contrast scrims, so light images can never eat the copy.
 *
 * Five layouts, chosen by ThumbnailConceptService: subject_left/right (a
 * picture carries it), stat_hero (a number carries it), question (the gap
 * carries it) and versus (a comparison carries it). Every one degrades: with
 * no hero image the spotlight becomes the subject, and with no concept at all
 * the backend hands over the title and this still composes.
 */
export const ThumbnailComp: React.FC<ThumbnailProps> = ({
  title = '',
  emphasis = '',
  badge = '',
  stat,
  layout = 'subject_right',
  vs_left,
  vs_right,
  kicker = '',
  theme,
  hero_url,
  hero_cutout = false,
  equation,
  font_pack,
  width = 1280,
  height = 720,
}) => {
  const t = theme ?? DEFAULT_THEME;
  const portrait = height > width;
  // One scale unit, so every number below is written at 720p and holds at any
  // size. Portrait gets a nudge: it is seen smaller, in a faster-moving feed.
  const u = (Math.min(width, height) / 720) * (portrait ? 1.12 : 1);

  const words = title.trim().split(/\s+/).filter(Boolean);
  const ink = t.text;
  const shadowInk = shade(t.bg_from, -0.55);

  // Math videos keep leading with the problem: it IS the hook.
  const isEquation = Boolean(equation && equation.trim() !== '');
  const effectiveLayout: ThumbnailLayout = isEquation ? 'stat_hero' : layout;
  const showsSubject =
    !isEquation &&
    Boolean(hero_url) &&
    (effectiveLayout === 'subject_left' || effectiveLayout === 'subject_right');
  const subjectSide: 'left' | 'right' =
    effectiveLayout === 'subject_left' ? 'left' : 'right';

  /* ---------------------------------------------------------------- type -- */

  // Type size is solved from BOTH counts: a 5-word hook with one long word
  // needs the same headroom as a 3-word hook of short ones, and only checking
  // word count is what used to let long words run off the plate.
  const longest = words.reduce((a, w) => Math.max(a, w.length), 0);
  const copyFraction = showsSubject ? 0.56 : effectiveLayout === 'versus' ? 0.86 : 0.94;
  const usable = (portrait ? width : width * copyFraction) - 96 * u;
  // ~0.58em average advance for a heavy grotesque at these weights.
  const byWidth = usable / Math.max(1, longest * 0.58);
  const byCount =
    (portrait ? 128 : 132) *
    u *
    (words.length > 4 ? 0.78 : words.length > 3 ? 0.9 : 1) *
    // Nothing else is competing for the frame, so the words take it.
    (showsSubject || isEquation ? 1 : 1.3);
  const size = Math.max(34 * u, Math.min(byWidth, byCount));

  const stroke = Math.max(3, size * 0.055);

  const wordStyle = (isEmphasis: boolean): React.CSSProperties => ({
    fontFamily: DISPLAY_FONT,
    fontWeight: 900,
    fontSize: size,
    lineHeight: 0.94,
    letterSpacing: -size * 0.022,
    color: isEmphasis ? inkOn(t.accent) : ink,
    // paint-order keeps the stroke OUTSIDE the glyph; without it a stroke this
    // heavy eats the counters and the word turns into a blob at grid size.
    // The emphasis word gets NO stroke: its slab is already the contrast, and
    // dark ink outlined in dark on accent read as a smudge at grid size —
    // exactly the word that had to survive the downscale.
    WebkitTextStroke: isEmphasis ? undefined : `${stroke}px ${shadowInk}`,
    paintOrder: 'stroke fill',
    textShadow: isEmphasis
      ? `0 ${stroke * 0.45}px 0 ${withAlpha(shadowInk, 0.3)}`
      : `0 ${stroke * 1.1}px 0 ${shadowInk}, 0 ${stroke * 2.4}px ${stroke * 2.4}px rgba(0,0,0,.42)`,
    display: 'inline-block',
    // Vertical padding too: a zero-lead slab clipped ascenders and apostrophes.
    padding: isEmphasis ? `${size * 0.05}px ${size * 0.1}px` : 0,
    background: isEmphasis ? t.accent : 'transparent',
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  });

  const emphasised = emphasis.trim().toUpperCase();
  const headline = (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: `${size * 0.1}px ${size * 0.22}px`,
        alignItems: 'baseline',
        // A hair of optical negative-lead so the slab sits tight to the stack.
        marginTop: -size * 0.06,
      }}
    >
      {words.map((word, i) => {
        const clean = word.replace(/[^\p{L}\p{N}'-]/gu, '').toUpperCase();
        return (
          <span key={i} style={wordStyle(emphasised !== '' && clean === emphasised)}>
            {word}
          </span>
        );
      })}
    </div>
  );

  /* --------------------------------------------------------------- parts -- */

  const accentBar = (
    <div style={{ display: 'flex', gap: 10 * u, marginBottom: 26 * u }}>
      <div style={{ width: 92 * u, height: 16 * u, background: t.accent }} />
      <div style={{ width: 30 * u, height: 16 * u, background: t.accent2 }} />
    </div>
  );

  const badgeSticker = badge ? (
    <div
      style={{
        position: 'absolute',
        top: 44 * u,
        right: 44 * u,
        transform: 'rotate(-7deg)',
        background: t.accent2,
        color: inkOn(t.accent2),
        fontFamily: MONO_FONT,
        fontWeight: 800,
        fontSize: 30 * u,
        letterSpacing: 3 * u,
        padding: `${12 * u}px ${20 * u}px`,
        border: `${4 * u}px solid ${shadowInk}`,
        boxShadow: `0 ${8 * u}px 0 ${shadowInk}`,
        zIndex: 6,
        whiteSpace: 'nowrap',
      }}
    >
      {badge}
    </div>
  ) : null;

  const kickerLine = kicker ? (
    <div
      style={{
        fontFamily: MONO_FONT,
        fontSize: 24 * u,
        fontWeight: 700,
        letterSpacing: 5 * u,
        color: t.accent,
        marginBottom: 16 * u,
      }}
    >
      {kicker}
    </div>
  ) : null;

  /** The cut-out, oversized and bleeding off the bottom edge. */
  const subject = hero_url ? (
    <div
      style={{
        position: 'absolute',
        ...(portrait
          ? { left: 0, right: 0, bottom: 0, height: '54%' }
          : subjectSide === 'right'
            ? { right: 0, top: 0, bottom: 0, width: '50%' }
            : { left: 0, top: 0, bottom: 0, width: '50%' }),
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 3,
      }}
    >
      {/* Spotlight: a soft accent bloom that separates the subject from the
          ground without a hard edge. Doubles as the subject when there is no
          usable cut-out. */}
      <div
        style={{
          position: 'absolute',
          inset: `-10%`,
          background: `radial-gradient(closest-side, ${withAlpha(t.accent2, 0.55)}, ${withAlpha(t.accent2, 0)} 72%)`,
        }}
      />
      {hero_cutout ? (
        <Img
          src={hero_url}
          style={{
            position: 'relative',
            width: '112%',
            height: '112%',
            objectFit: 'contain',
            objectPosition: 'bottom',
            // A contact shadow is what stops a cut-out looking pasted on.
            filter: `drop-shadow(0 ${14 * u}px ${18 * u}px rgba(0,0,0,.55))`,
          }}
        />
      ) : (
        // No alpha: frame it instead of pretending, on an offset accent plinth.
        <div style={{ position: 'relative', width: '82%', height: '74%', marginBottom: '8%' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transform: `translate(${16 * u}px, ${16 * u}px)`,
              background: t.accent,
            }}
          />
          <Img
            src={hero_url}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              border: `${5 * u}px solid ${ink}`,
            }}
          />
        </div>
      )}
    </div>
  ) : null;

  /**
   * The type-only frames need something to weigh against the words, or half
   * the picture is an empty gradient — which is what a "designed" thumbnail
   * with no photo used to look like. A radiating burst does the job at any
   * size: it is pure geometry, so it survives the downscale to 210px where a
   * texture or a soft shape would turn to mush, and it points AT the copy.
   */
  const burst = !showsSubject ? (
    <AbsoluteFill style={{ zIndex: 1, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          width: 1180 * u,
          height: 1180 * u,
          ...(portrait
            ? { left: '50%', bottom: -420 * u, marginLeft: -590 * u }
            : { right: -300 * u, bottom: -360 * u }),
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(closest-side, ${withAlpha(t.accent, 0.34)}, ${withAlpha(t.accent, 0)} 70%)`,
          }}
        />
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: '52%',
              height: 26 * u,
              marginTop: -13 * u,
              transformOrigin: '0 50%',
              transform: `rotate(${i * (360 / 14)}deg)`,
              background: withAlpha(i % 2 === 0 ? t.accent : t.accent2, i % 2 === 0 ? 0.2 : 0.12),
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  ) : null;

  /** The number, set as the hero of the frame. */
  const statPlate = (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: t.accent,
        color: inkOn(t.accent),
        fontFamily: DISPLAY_FONT,
        fontWeight: 900,
        fontSize: (portrait ? 190 : 210) * u * (String(stat ?? '').length > 6 ? 0.62 : 1),
        lineHeight: 1,
        letterSpacing: -4 * u,
        padding: `${18 * u}px ${34 * u}px`,
        border: `${6 * u}px solid ${shadowInk}`,
        boxShadow: `0 ${14 * u}px 0 ${shadowInk}`,
        whiteSpace: 'nowrap',
      }}
    >
      {stat}
    </div>
  );

  const equationPlate = (
    <div
      style={{
        background: t.accent,
        padding: `${30 * u}px ${40 * u}px`,
        border: `${6 * u}px solid ${shadowInk}`,
        boxShadow: `0 ${14 * u}px 0 ${shadowInk}`,
        maxWidth: '86%',
      }}
    >
      <MathText
        expr={equation ?? ''}
        color={inkOn(t.accent)}
        style={{
          fontFamily: DISPLAY_FONT,
          fontWeight: 900,
          fontSize: (portrait ? 96 : 118) * u * ((equation ?? '').length > 14 ? 0.66 : 1),
          lineHeight: 1.08,
          justifyContent: 'center',
          textAlign: 'center',
        }}
      />
    </div>
  );

  const versusPlates = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 26 * u,
        marginTop: 30 * u,
        flexWrap: 'wrap',
      }}
    >
      {[
        { label: vs_left, bg: t.accent },
        { label: vs_right, bg: t.accent2 },
      ].map((side, i) => (
        <React.Fragment key={i}>
          {i === 1 ? (
            <span
              style={{
                fontFamily: DISPLAY_FONT,
                fontWeight: 900,
                fontSize: 64 * u,
                color: ink,
                WebkitTextStroke: `${3 * u}px ${shadowInk}`,
                paintOrder: 'stroke fill',
              }}
            >
              VS
            </span>
          ) : null}
          <span
            style={{
              background: side.bg,
              color: inkOn(side.bg),
              fontFamily: DISPLAY_FONT,
              fontWeight: 900,
              fontSize: 62 * u,
              lineHeight: 1,
              padding: `${14 * u}px ${24 * u}px`,
              border: `${5 * u}px solid ${shadowInk}`,
              boxShadow: `0 ${9 * u}px 0 ${shadowInk}`,
              whiteSpace: 'nowrap',
            }}
          >
            {side.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );

  /* --------------------------------------------------------------- ground -- */

  const copyBlock = (
    <div
      style={{
        position: 'relative',
        zIndex: 4,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: portrait && showsSubject ? 'flex-start' : 'center',
        alignItems: effectiveLayout === 'stat_hero' && !portrait ? 'center' : 'flex-start',
        textAlign: effectiveLayout === 'stat_hero' && !portrait ? 'center' : 'left',
        height: '100%',
        padding: portrait
          ? `${72 * u}px ${56 * u}px ${showsSubject ? 0 : 72 * u}px`
          : `${56 * u}px ${64 * u}px`,
        boxSizing: 'border-box',
        // The copy owns the side the subject is not on.
        width: showsSubject && !portrait ? '58%' : '100%',
        marginLeft: showsSubject && !portrait && subjectSide === 'left' ? 'auto' : 0,
      }}
    >
      {accentBar}
      {kickerLine}
      {isEquation ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 30 * u, alignItems: 'center', width: '100%' }}>
          {equationPlate}
          {headline}
        </div>
      ) : effectiveLayout === 'stat_hero' && stat ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 * u, alignItems: 'inherit' }}>
          {statPlate}
          {headline}
        </div>
      ) : (
        <>
          {headline}
          {effectiveLayout === 'question' ? (
            <span
              style={{
                fontFamily: DISPLAY_FONT,
                fontWeight: 900,
                fontSize: size * 1.5,
                lineHeight: 0.8,
                color: t.accent,
                WebkitTextStroke: `${stroke}px ${shadowInk}`,
                paintOrder: 'stroke fill',
                marginTop: 8 * u,
              }}
            >
              ?
            </span>
          ) : null}
          {effectiveLayout === 'versus' && vs_left && vs_right ? versusPlates : null}
        </>
      )}
    </div>
  );

  return (
    <ThemeProvider theme={t}>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <FontLoader pack={font_pack ?? undefined} />

        {/* Ground: a real gradient, not a flat fill — the depth reads even at
            210px wide, and it gives the stroke something to sit against. */}
        <AbsoluteFill
          style={{
            background: `linear-gradient(155deg, ${shade(t.bg_from, 0.1)} 0%, ${t.bg_from} 45%, ${shade(t.bg_to, -0.18)} 100%)`,
          }}
        />

        {/* Diagonal wedge. Diagonals survive downscaling; panel edges do not. */}
        <AbsoluteFill
          style={{
            background: withAlpha(t.accent, 0.14),
            clipPath: portrait
              ? 'polygon(0 46%, 100% 30%, 100% 100%, 0 100%)'
              : subjectSide === 'right'
                ? 'polygon(38% 0, 100% 0, 100% 100%, 12% 100%)'
                : 'polygon(0 0, 62% 0, 88% 100%, 0 100%)',
          }}
        />

        {burst}
        {subject}

        {/* Contrast scrim under the copy side — the guarantee that a bright
            hero can never wash out the hook. */}
        <AbsoluteFill
          style={{
            background: portrait
              ? `linear-gradient(180deg, ${withAlpha(shadowInk, 0.72)} 0%, ${withAlpha(shadowInk, 0)} 46%)`
              : subjectSide === 'right'
                ? `linear-gradient(90deg, ${withAlpha(shadowInk, 0.68)} 0%, ${withAlpha(shadowInk, 0)} 62%)`
                : `linear-gradient(270deg, ${withAlpha(shadowInk, 0.68)} 0%, ${withAlpha(shadowInk, 0)} 62%)`,
            zIndex: 3,
          }}
        />

        {copyBlock}
        {badgeSticker}

        {/* Vignette: pulls the eye to the middle and hides the fact that the
            corners are the least designed part of any thumbnail. */}
        <AbsoluteFill
          style={{
            background: `radial-gradient(120% 90% at 50% 45%, rgba(0,0,0,0) 52%, rgba(0,0,0,.42) 100%)`,
            zIndex: 7,
            pointerEvents: 'none',
          }}
        />

        {/* Accent rule along the bottom — the one piece of the video's own
            furniture that survives at thumbnail scale. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 12 * u,
            background: `linear-gradient(90deg, ${t.accent} 0%, ${t.accent} 62%, ${t.accent2} 62%, ${t.accent2} 100%)`,
            zIndex: 8,
          }}
        />
      </AbsoluteFill>
    </ThemeProvider>
  );
};

/* ------------------------------------------------------------- colour -- */

/** #rrggbb → rgba() at `a`, so a theme colour can be used as a soft wash. */
function withAlpha(hex: string, a: number): string {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(0,0,0,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Lighten (amount > 0) or darken (< 0) a #rrggbb toward white/black. */
function shade(hex: string, amount: number): string {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return hex;
  const mix = (c: number) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))
      .toString(16)
      .padStart(2, '0');
  return `#${mix(parseInt(h.slice(0, 2), 16))}${mix(parseInt(h.slice(2, 4), 16))}${mix(parseInt(h.slice(4, 6), 16))}`;
}
