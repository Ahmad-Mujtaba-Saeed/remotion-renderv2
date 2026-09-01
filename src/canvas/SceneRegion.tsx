import React from 'react';
import { useVideoConfig } from 'remotion';
import { CanvasItem, Scene } from '../types';
import { SceneLayout } from '../components/SceneRouter';
import { SceneClockProvider, SceneClockWindow } from './SceneClock';
import { RegionStyleProvider } from './RegionStyle';
import { SceneMetaProvider } from '../components/SceneMeta';
import { useTheme } from '../theme';

/**
 * One scene as a FRAMELESS composition region on the world canvas: text sits
 * directly on the flat colour field, media is a crisp rectangle. No cards, no
 * plates, no shadows, no rotation.
 *
 * The content is the scene's REGULAR layout rendered at the composition's
 * design resolution and uniformly scaled into the region — every layout,
 * theme token and responsive fix behaves identically in slides mode and here.
 *
 * CRISPNESS: this element must never carry a CSS `filter` — filters force the
 * region into its own rasterized surface, and combined with the animated
 * camera transform Chromium reuses rasters taken at flight scales, which is
 * what made text blurry once the camera settled. Dimming is therefore an
 * OVERLAY (pure opacity), and focus is transform/opacity only.
 *
 * `focus` (0..1) drives the dim scrim and a micro scale-pop;
 * `enter` (0..1) condenses the region in as it materialises out of thin air;
 * `lod` (0..1) fades regions that are too small to matter at the current
 * camera distance.
 */
export const SceneRegion: React.FC<{
  item: CanvasItem;
  scene: Scene;
  /** 0-based scene position + total count (feeds the per-scene styling). */
  index?: number;
  count?: number;
  focus: number;
  lod: number;
  /** Isolation visibility (0..1): scenes off the camera's beat don't exist. */
  alpha?: number;
  /** Birth progress (0..1) while the scene materialises mid-flight. */
  enter?: number;
  /**
   * Changeover motion for a QUIET CUT (treatment `same_frame`), in fractions
   * of the region's own size plus a zoom multiplier. On a cut the camera does
   * not move, so this is the whole edit: the arriving card comes in from the
   * direction its transition implies and the departing one leaves the other
   * way. Zero for a scene the camera flew to — there the flight IS the edit.
   */
  shift?: { dx: number; dy: number; zoom: number };
  clock: SceneClockWindow;
}> = ({ item, scene, index = 0, count = 1, focus, lod, alpha = 1, enter = 1, shift, clock }) => {
  const { width: designW } = useVideoConfig();
  const theme = useTheme();

  // Content is designed at the viewport's width with the height that keeps
  // the region's own aspect, then scaled uniformly into place.
  const scale = item.w / designW;
  const contentH = item.h / scale;

  const opacity = lod * alpha;
  if (opacity <= 0.01) return null;

  // Materialise: condense from slightly larger + drift down a touch, so the
  // scene reads as forming out of thin air rather than being switched on.
  const born = Math.max(0, Math.min(1, enter));
  const pop = 1 + 0.015 * focus + 0.05 * (1 - born);
  const settleY = (1 - born) * item.h * 0.02;

  const dx = (shift?.dx ?? 0) * item.w;
  const dy = (shift?.dy ?? 0) * item.h;
  const zoom = shift?.zoom ?? 1;

  return (
    <div
      style={{
        position: 'absolute',
        left: item.x - item.w / 2,
        top: item.y - item.h / 2,
        width: item.w,
        height: item.h,
        opacity,
        transform: `translate(${dx}px, ${settleY + dy}px) scale(${pop * zoom})`,
        transformOrigin: 'center center',
      }}
    >
      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        <div
          style={{
            width: designW,
            height: contentH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'relative',
          }}
        >
          <RegionStyleProvider value={{ frameless: true, mediaRadius: 6, aspect: item.w / Math.max(1, item.h) }}>
            <SceneMetaProvider value={{ index, count, style: scene.style, words: scene.narration_words }}>
              <SceneClockProvider window={clock}>
                {/* Punchlines render in CanvasJourney's screen-space layer,
                    NOT here — inside the scaled world they'd soften. */}
                <SceneLayout scene={scene} />
              </SceneClockProvider>
            </SceneMetaProvider>
          </RegionStyleProvider>
        </div>
      </div>

      {/* Out-of-focus dim as an overlay wash (NOT a filter — see above). */}
      {focus < 0.98 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: theme.bg_from,
            opacity: 0.32 * (1 - focus),
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  );
};
