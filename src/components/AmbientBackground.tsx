import React, { createContext, useContext } from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Theme } from '../types';
import { useTheme, isLightTheme, useSkin } from '../theme';

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

// ---------------------------------------------------------------------------
// Mood backdrop field (§11.5). ONE moving thing, barely: a hairline/dot
// texture on the flat colour field, keyed to the scene's mood, drifting at
// ~2px/s. The flat law still holds — no washes, no glow, no grain; alphas sit
// at 0.04–0.07 so the field reads as paper, not decoration. The flag rides a
// context (mounted once in ExplainerVideo, same delivery as Skin/MotionStyle)
// because the mounters of this component don't otherwise know shot-level
// config; the MOOD stays a prop because only the mounter knows its scene.
// ---------------------------------------------------------------------------

const BackdropContext = createContext<boolean>(false);

export const BackdropProvider: React.FC<{ enabled: boolean; children: React.ReactNode }> = ({
  enabled,
  children,
}) => <BackdropContext.Provider value={enabled}>{children}</BackdropContext.Provider>;

export const useBackdrop = (): boolean => useContext(BackdropContext);

type FieldKind = 'grid' | 'dots' | 'hatch';

/** Mood → pattern. Order and calm read as a wide grid; drive and tension as a
 *  diagonal hatch; the one buoyant mood as a dot field. Unknown moods take the
 *  quietest pattern rather than none, so a new analyzer mood never flickers
 *  the field off. */
export const fieldForMood = (mood?: string | null): FieldKind => {
  switch ((mood ?? 'neutral').toLowerCase()) {
    case 'dramatic':
    case 'tense':
    case 'suspense':
      return 'hatch';
    case 'upbeat':
      return 'dots';
    default:
      return 'grid';
  }
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
    const t = frame / fps;
    const kind = fieldForMood(mood);
    const line = (alpha: number): string =>
      isLightTheme(theme) ? `rgba(23,18,14,${alpha})` : `rgba(255,255,255,${alpha})`;
    let style: React.CSSProperties | null = null;
    if (kind === 'grid') {
      const c = Math.round(width * 0.06);
      style = {
        backgroundImage: hairlineGrid(theme, 0.045),
        backgroundSize: `${c}px ${c}px, ${c}px ${c}px`,
        backgroundPosition: `${(t * 2) % c}px ${(t * 2) % c}px`,
      };
    } else if (kind === 'dots') {
      const c = Math.round(width * 0.03);
      style = {
        backgroundImage: `radial-gradient(${line(0.07)} 1.5px, transparent 1.5px)`,
        backgroundSize: `${c}px ${c}px`,
        backgroundPosition: `0px ${-((t * 2) % c)}px`,
      };
    } else {
      const gap = Math.round(width * 0.04);
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
                filter: 'blur(26px) brightness(0.4) saturate(0.9)',
                transform: `scale(${lerp(1.12, 1.2, p)})`,
              }}
            />
          </AbsoluteFill>
          <Vignette />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
