import React, { createContext, useContext, useMemo } from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Theme } from '../types';
import { useTheme, isLightTheme, useSkin } from '../theme';

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** `#rrggbb` → `rgba(r,g,b,alpha)`. Used to wash a light scheme's ambient
 *  backdrop toward its own paper so the scheme's dark ink stays readable. */
const withAlpha = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '').trim();
  if (h.length < 6) return `rgba(0,0,0,${alpha})`;
  const n = parseInt(h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

// ---------------------------------------------------------------------------
// Mood backdrop field (§11.5). ONE moving thing, barely: a hairline/dot
// texture on the flat colour field, keyed to the scene's mood, drifting at
// ~2px/s. The flat law still holds — no washes, no glow, no grain; alphas sit
// at 0.04–0.07 so the field reads as paper, not decoration. The flag rides a
// context (mounted once in ExplainerVideo, same delivery as Skin/MotionStyle)
// because the mounters of this component don't otherwise know shot-level
// config; the MOOD stays a prop because only the mounter knows its scene.
// ---------------------------------------------------------------------------

type FieldKind = 'grid' | 'dots' | 'hatch' | 'rules' | 'plus';
type MoodGroup = 'order' | 'drive' | 'buoyant';

/** The unique look's backdrop choices (Laravel StyleRecipe `backdrop`). */
export interface BackdropLook {
  kinds?: Partial<Record<MoodGroup, string>> | null;
  scale?: number | null;
  drift?: number | null;
}

interface BackdropState {
  enabled: boolean;
  look: BackdropLook | null;
}

const BackdropContext = createContext<BackdropState>({ enabled: false, look: null });

export const BackdropProvider: React.FC<{
  enabled: boolean;
  look?: BackdropLook | null;
  children: React.ReactNode;
}> = ({ enabled, look, children }) => {
  const value = useMemo(() => ({ enabled, look: look ?? null }), [enabled, look]);
  return <BackdropContext.Provider value={value}>{children}</BackdropContext.Provider>;
};

export const useBackdrop = (): boolean => useContext(BackdropContext).enabled;

const useBackdropLook = (): BackdropLook | null => useContext(BackdropContext).look;

const KINDS: FieldKind[] = ['grid', 'dots', 'hatch', 'rules', 'plus'];

/** Mood → group. Order and calm; drive and tension; the one buoyant mood. */
const groupForMood = (mood?: string | null): MoodGroup => {
  switch ((mood ?? 'neutral').toLowerCase()) {
    case 'dramatic':
    case 'tense':
    case 'suspense':
      return 'drive';
    case 'upbeat':
      return 'buoyant';
    default:
      return 'order';
  }
};

/** Mood → pattern. Order and calm read as a wide grid; drive and tension as a
 *  diagonal hatch; the one buoyant mood as a dot field — unless the video's
 *  unique look chose its own texture for that group. Unknown moods take the
 *  quietest pattern rather than none, so a new analyzer mood never flickers
 *  the field off. */
export const fieldForMood = (mood?: string | null, look?: BackdropLook | null): FieldKind => {
  const group = groupForMood(mood);
  const chosen = look?.kinds?.[group];
  if (chosen && KINDS.includes(chosen as FieldKind)) return chosen as FieldKind;
  return group === 'drive' ? 'hatch' : group === 'buoyant' ? 'dots' : 'grid';
};

/**
 * One ruling: horizontal + vertical 1px hairlines at the given alpha, toward
 * white on a dark field and toward ink on a light one (same convention as
 * theme.tsx's `hairline`). Cell size is set via backgroundSize by the caller.
 */
const hairlineGrid = (theme: Theme, alpha: number): string => {
  const line = isLightTheme(theme) ? `rgba(23,18,14,${alpha})` : `rgba(255,255,255,${alpha})`;
  return `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`;
};

/**
 * A whisper of edge darkening. Enough to stop the corners competing with the
 * copy, far too little to read as a "vignette effect".
 */
export const Vignette: React.FC = () => {
  const theme = useTheme();
  const edge = isLightTheme(theme) ? 'rgba(40,30,20,0.05)' : 'rgba(0,0,0,0.16)';
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(130% 130% at 50% 45%, transparent 68%, ${edge} 100%)`,
        pointerEvents: 'none',
      }}
    />
  );
};

/**
 * The field a scene sits on: ONE flat colour.
 *
 * It used to be a diagonal gradient with two drifting accent glows, orbiting
 * motion graphics, a vignette and film grain — five moving decorations behind
 * copy that is already moving. Now the background is a colour and nothing else,
 * so the type, the rules and the camera are the only things asking for
 * attention.
 *
 * `imageUrl` is the slides-mode AI ambient backdrop; it keeps its blur because
 * it lives in screen space, never inside the camera-scaled world.
 *
 * Under the BLUEPRINT skin the field carries the drawing's hairline grid —
 * static, screen-space, minor cells with a heavier major line every fifth.
 * `grid={false}` lets the math board opt out: its slate decor already draws a
 * grid pinned to the board WORLD, and two rulings at different parallax would
 * fight.
 *
 * `mood` + the BackdropProvider flag turn on the mood field (§11.5, note at
 * the top). Precedence when several field treatments could apply: an ambient
 * image covers everything; the blueprint grid IS that skin's field; the mood
 * field only draws on an otherwise bare colour.
 */
export const AmbientBackground: React.FC<{ imageUrl?: string; grid?: boolean; mood?: string | null }> = ({
  imageUrl,
  grid = true,
  mood,
}) => {
  const theme = useTheme();
  const skin = useSkin();
  const backdropOn = useBackdrop();
  const look = useBackdropLook();
  const frame = useCurrentFrame();
  const { durationInFrames, width, fps } = useVideoConfig();
  const p = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // An ambient image covers the field entirely, so the grid is skipped rather
  // than painted underneath it for nothing.
  const cell = Math.round(width * 0.045);
  const minor = hairlineGrid(theme, 0.055);
  const major = hairlineGrid(theme, 0.11);
  const blueprintGrid =
    skin === 'blueprint' && grid && !imageUrl ? (
      <AbsoluteFill
        style={{ backgroundImage: `${major}, ${minor}`, backgroundSize: `${cell * 5}px ${cell * 5}px, ${cell * 5}px ${cell * 5}px, ${cell}px ${cell}px, ${cell}px ${cell}px` }}
      />
    ) : null;

  // Mood field. Drift is time-based (deterministic from the frame), ~2px/s —
  // 12px over a 6s scene, felt rather than seen. backgroundPosition moves the
  // pattern without a transform, so no compositor layer is promoted inside
  // the camera world (the "text goes blurry" class of bug).
  let moodField: React.ReactNode = null;
  if (backdropOn && !imageUrl && skin !== 'blueprint' && grid) {
    // A unique look may scale the texture and reverse its drift; without one
    // both are exactly 1 and the field is the house field, pixel for pixel.
    const k = typeof look?.scale === 'number' && Number.isFinite(look.scale) ? Math.min(1.6, Math.max(0.6, look.scale)) : 1;
    const dir = look?.drift === -1 ? -1 : 1;
    const t = (frame / fps) * dir;
    const kind = fieldForMood(mood, look);
    const line = (alpha: number): string =>
      isLightTheme(theme) ? `rgba(23,18,14,${alpha})` : `rgba(255,255,255,${alpha})`;
    let style: React.CSSProperties | null = null;
    if (kind === 'grid') {
      const c = Math.round(width * 0.06 * k);
      style = {
        backgroundImage: hairlineGrid(theme, 0.045),
        backgroundSize: `${c}px ${c}px, ${c}px ${c}px`,
        backgroundPosition: `${(t * 2) % c}px ${(t * 2) % c}px`,
      };
    } else if (kind === 'dots') {
      const c = Math.round(width * 0.03 * k);
      style = {
        backgroundImage: `radial-gradient(${line(0.07)} 1.5px, transparent 1.5px)`,
        backgroundSize: `${c}px ${c}px`,
        backgroundPosition: `0px ${-((t * 2) % c)}px`,
      };
    } else if (kind === 'rules') {
      // Horizontal hairlines only — a ruled field, drifting downward.
      const c = Math.round(width * 0.05 * k);
      style = {
        backgroundImage: `linear-gradient(${line(0.05)} 1px, transparent 1px)`,
        backgroundSize: `${c}px ${c}px`,
        backgroundPosition: `0px ${(t * 2) % c}px`,
      };
    } else if (kind === 'plus') {
      // A sparse field of plus marks, one per cell: a tiny tiled SVG (a
      // gradient cannot draw a mark smaller than its own tile).
      const c = Math.round(width * 0.055 * k);
      const h = c / 2;
      const arm = Math.max(4, Math.round(c * 0.12));
      const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='${c}' height='${c}'>` +
        `<path d='M${h - arm} ${h}H${h + arm}M${h} ${h - arm}V${h + arm}' stroke='${line(0.1)}' stroke-width='1' fill='none'/></svg>`;
      style = {
        backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
        backgroundSize: `${c}px ${c}px`,
        backgroundPosition: `${(t * 2) % c}px ${(t * 1.2) % c}px`,
      };
    } else {
      const gap = Math.round(width * 0.04 * k);
      style = {
        backgroundImage: `repeating-linear-gradient(45deg, ${line(0.04)} 0px, ${line(0.04)} 1px, transparent 1px, transparent ${gap}px)`,
        // Drift along the hatch axis: equal x/y advance slides the pattern
        // parallel to its own lines.
        backgroundPosition: `${(t * 2.5) % (gap * 2)}px ${(t * 2.5) % (gap * 2)}px`,
      };
    }
    moodField = <AbsoluteFill style={style} />;
  }

  return (
    <AbsoluteFill style={{ background: theme.bg_from }}>
      {blueprintGrid}
      {moodField}
      {imageUrl ? (
        <>
          <AbsoluteFill>
            <Img
              src={imageUrl}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                // The backdrop is a MOOD wash, never a competing picture, and it
                // must never swallow the copy. On a DARK scheme (light ink) it
                // darkens so white text reads; on a LIGHT scheme (dark ink) it
                // must instead stay PALE — a bright, low-saturation ghost — or
                // the scheme's near-black text lands invisibly on a dark field
                // (the bone-scheme "can't see the heading" bug). Same
                // luminance-flip convention as hairline()/inkOn()/Vignette.
                filter: isLightTheme(theme)
                  ? 'blur(26px) brightness(1.12) saturate(0.75)'
                  : 'blur(26px) brightness(0.55) saturate(0.35)',
                transform: `scale(${lerp(1.12, 1.2, p)})`,
              }}
            />
          </AbsoluteFill>
          {/* Legibility wash. A light scheme lays its own paper over the image
              at high opacity so the ambient reads as a faint watermark and the
              dark ink keeps full contrast; a dark scheme keeps the plain
              vignette it always had. */}
          {/* Both schemes now lay their own field over the photo. On a dark
              scheme the plain darkened photo kept its own warm cast, so every
              text card on a slate video sat on a muddy brown blur (project
              211); a 64% wash of the scheme's colour turns it into texture in
              the palette. */}
          <AbsoluteFill style={{ background: withAlpha(theme.bg_from, isLightTheme(theme) ? 0.74 : 0.64) }} />
          <Vignette />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
