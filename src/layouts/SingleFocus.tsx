import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { SlotRenderer } from '../components/SlotRenderer';
import { useRegionStyle } from '../canvas/RegionStyle';
import { useSceneClock } from '../canvas/SceneClock';
import { useTheme } from '../theme';

/**
 * single_focus: one slot (slot_main) over the scene's colour field.
 *
 * In the frameless canvas journey this layout carries the scene alone, so it
 * gets a real composition instead of a bare full-bleed slot:
 *  - text + AI illustration  -> editorial split (copy beside the generated
 *    visual), stacked when the region is portrait;
 *  - text only               -> copy with a flat accent field mark, so the
 *    region never reads as empty space;
 *  - media                   -> gently inset, so the picture sits IN the scene
 *    rather than being the whole scene.
 * Slides mode keeps the classic behaviour untouched.
 */

/** The AI illustration pane: a crisp rectangle with a slow push-in. */
const Illustration: React.FC<{ url: string }> = ({ url }) => {
  const { fps } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.8) });
  const p = Math.max(0, Math.min(1, frame / Math.max(1, durationInFrames)));

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 6,
        overflow: 'hidden',
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [40, 0])}px)`,
      }}
    >
      <Img
        src={url}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.04 + 0.07 * p})` }}
      />
    </div>
  );
};

/**
 * The flat mark that gives a text-only region its shape. Five variants, picked
 * per scene, so consecutive text scenes never share a silhouette — but each is
 * one solid accent form, not a cloud of coloured light.
 *
 * These replace the old radial "accent washes". Note the crispness constraint
 * still holds: no `filter` inside a camera-scaled region, ever.
 */
const FieldMark: React.FC<{ variant?: number }> = ({ variant = 0 }) => {
  const theme = useTheme();
  const rule = (style: React.CSSProperties) => (
    <div style={{ position: 'absolute', background: theme.accent, ...style }} />
  );

  switch (variant) {
    case 1:
      // A rule along the bottom edge.
      return <AbsoluteFill style={{ pointerEvents: 'none' }}>{rule({ left: 0, right: 0, bottom: 0, height: 14 })}</AbsoluteFill>;
    case 2:
      // A large thin outline circle bleeding off the top-right corner.
      return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          <div
            style={{
              position: 'absolute',
              width: '62%',
              aspectRatio: '1',
              right: '-16%',
              top: '-22%',
              borderRadius: '50%',
              border: `10px solid ${theme.accent}`,
              opacity: 0.28,
            }}
          />
        </AbsoluteFill>
      );
    case 3:
      // A solid accent square bleeding off the bottom-left corner.
      return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          <div
            style={{
              position: 'absolute',
              width: '30%',
              aspectRatio: '1',
              left: '-11%',
              bottom: '-13%',
              background: theme.accent,
              opacity: 0.16,
            }}
          />
        </AbsoluteFill>
      );
    case 4:
      // Editorial frame: a hairline at the top, an accent rule at the bottom.
      return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          {rule({ left: 0, right: 0, top: 0, height: 3, opacity: 0.35 })}
          {rule({ left: 0, width: '38%', bottom: 0, height: 10 })}
        </AbsoluteFill>
      );
    default:
      // A rule down the left edge.
      return <AbsoluteFill style={{ pointerEvents: 'none' }}>{rule({ top: 0, bottom: 0, left: 0, width: 14 })}</AbsoluteFill>;
  }
};

/** Cheap stable hash so each scene picks its own mark. */
const hashId = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const SingleFocus: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_main'];
  const region = useRegionStyle();
  const { width, height } = useVideoConfig();
  const isText = slot?.content_type === 'text_block' || slot?.content_type === 'explanation_box';

  // Slides mode. A text-only scene WITH an AI illustration composes the same
  // editorial split as the canvas journey — the generated image was invisible
  // in slides before, which made the whole illustration budget look wasted.
  if (!region.frameless) {
    if (isText && scene.illustration_url) {
      const slidePortrait = height > width;
      return (
        <AbsoluteFill style={{ padding: '7%', boxSizing: 'border-box' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: slidePortrait ? 'column-reverse' : 'row',
              width: '100%',
              height: '100%',
              gap: '5%',
              alignItems: 'stretch',
            }}
          >
            <div style={{ flex: 1.05, minWidth: 0, minHeight: 0, display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '100%' }}>
                {/* Half the padded frame, beside the illustration. */}
                <SlotRenderer slot={slot} columnFrac={slidePortrait ? 0.78 : 0.42} />
              </div>
            </div>
            <div style={{ flex: 0.85, minWidth: 0, minHeight: 0 }}>
              <Illustration url={scene.illustration_url} />
            </div>
          </div>
        </AbsoluteFill>
      );
    }
    if (isText) {
      return (
        <AbsoluteFill style={{ padding: '7%' }}>
          <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
            {/* 7% padding here plus the panel's own inset — the text column is
                appreciably narrower than the frame, and the solver must be
                told the truth or it hands back a size that still wraps. */}
            <SlotRenderer slot={slot} columnFrac={0.75} />
          </div>
        </AbsoluteFill>
      );
    }
    return (
      <AbsoluteFill>
        <SlotRenderer slot={slot} />
      </AbsoluteFill>
    );
  }

  const aspect = region.aspect ?? width / Math.max(1, height);
  const portrait = aspect < 0.9;

  const mark = hashId(scene.scene_id) % 5;

  // ---- Canvas journey: text + AI illustration = editorial split ------------
  if (isText && scene.illustration_url) {
    return (
      <AbsoluteFill style={{ padding: '5.5%', boxSizing: 'border-box' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: portrait ? 'column-reverse' : 'row',
            width: '100%',
            height: '100%',
            gap: '5%',
            alignItems: 'stretch',
          }}
        >
          <div style={{ flex: 1.05, minWidth: 0, minHeight: 0, display: 'flex' }}>
            <SlotRenderer slot={slot} columnFrac={portrait ? 0.82 : 0.44} />
          </div>
          <div style={{ flex: 0.85, minWidth: 0, minHeight: 0 }}>
            <Illustration url={scene.illustration_url} />
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // ---- Canvas journey: text only = copy against a flat field mark ----------
  if (isText) {
    return (
      <AbsoluteFill style={{ justifyContent: 'center' }}>
        <FieldMark variant={mark} />
        <AbsoluteFill style={{ padding: '5%', boxSizing: 'border-box', justifyContent: 'center' }}>
          <SlotRenderer slot={slot} columnFrac={0.82} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // ---- Canvas journey: media, inset on the field ---------------------------
  return (
    <AbsoluteFill style={{ padding: '4.5%', boxSizing: 'border-box' }}>
      <SlotRenderer slot={slot} />
    </AbsoluteFill>
  );
};
