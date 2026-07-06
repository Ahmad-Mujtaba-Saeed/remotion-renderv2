import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { SlotRenderer } from '../components/SlotRenderer';
import { useRegionStyle } from '../canvas/RegionStyle';
import { useSceneClock } from '../canvas/SceneClock';
import { useTheme } from '../theme';

/**
 * single_focus: one slot (slot_main) over the ambient background.
 *
 * In the frameless canvas journey this layout carries the scene alone, so it
 * gets a real composition instead of a bare full-bleed slot:
 *  - text + AI illustration  -> editorial split (copy beside a soft-masked
 *    generated visual), stacked when the region is portrait;
 *  - text only               -> copy over a large accent wash so the region
 *    never reads as empty space;
 *  - media                   -> gently inset with an offset accent glow
 *    behind it, so the picture sits IN the scene rather than being the
 *    whole scene.
 * Slides mode keeps the classic behaviour untouched.
 */

/** The AI illustration pane: soft mask, deep shadow, slow push-in, glow. */
const Illustration: React.FC<{ url: string }> = ({ url }) => {
  const theme = useTheme();
  const { fps } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.8) });
  const p = Math.max(0, Math.min(1, frame / Math.max(1, durationInFrames)));

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Accent halo bleeding out behind the picture. */}
      <div
        style={{
          position: 'absolute',
          inset: '-12%',
          background: `radial-gradient(55% 55% at 50% 50%, ${theme.accent}3d, transparent 72%)`,
          filter: 'blur(40px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 44,
          overflow: 'hidden',
          boxShadow: '0 40px 110px rgba(0,0,0,0.55)',
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [40, 0])}px)`,
        }}
      >
        <Img
          src={url}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${1.04 + 0.07 * p})`,
          }}
        />
      </div>
    </div>
  );
};

/** Two soft theme-coloured washes that anchor text-only regions. */
const AccentWash: React.FC = () => {
  const theme = useTheme();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          width: '58%',
          height: '78%',
          left: '-14%',
          top: '-18%',
          background: `radial-gradient(50% 50% at 50% 50%, ${theme.accent}30, transparent 70%)`,
          filter: 'blur(30px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '52%',
          height: '68%',
          right: '-12%',
          bottom: '-16%',
          background: `radial-gradient(50% 50% at 50% 50%, ${theme.accent2}28, transparent 70%)`,
          filter: 'blur(30px)',
        }}
      />
    </AbsoluteFill>
  );
};

export const SingleFocus: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_main'];
  const region = useRegionStyle();
  const theme = useTheme();
  const { width, height } = useVideoConfig();
  const isText = slot?.content_type === 'text_block' || slot?.content_type === 'explanation_box';

  // Slides mode: the classic behaviour, untouched.
  if (!region.frameless) {
    if (isText) {
      return (
        <AbsoluteFill style={{ padding: '7%' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 28, overflow: 'hidden' }}>
            <SlotRenderer slot={slot} />
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

  // ---- Canvas journey: text + AI illustration = editorial split ------------
  if (isText && scene.illustration_url) {
    return (
      <AbsoluteFill style={{ padding: '5.5%', boxSizing: 'border-box' }}>
        <AccentWash />
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
            <SlotRenderer slot={slot} />
          </div>
          <div style={{ flex: 0.85, minWidth: 0, minHeight: 0 }}>
            <Illustration url={scene.illustration_url} />
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // ---- Canvas journey: text only = copy over an accent wash ----------------
  if (isText) {
    return (
      <AbsoluteFill style={{ padding: '3%', boxSizing: 'border-box' }}>
        <AccentWash />
        <SlotRenderer slot={slot} />
      </AbsoluteFill>
    );
  }

  // ---- Canvas journey: media, inset with an offset glow behind it ----------
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          width: '72%',
          height: '72%',
          left: '-9%',
          top: '-11%',
          background: `radial-gradient(50% 50% at 50% 50%, ${theme.accent}33, transparent 70%)`,
          filter: 'blur(46px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '60%',
          height: '60%',
          right: '-8%',
          bottom: '-10%',
          background: `radial-gradient(50% 50% at 50% 50%, ${theme.accent2}2b, transparent 70%)`,
          filter: 'blur(46px)',
        }}
      />
      <AbsoluteFill style={{ padding: '4.5%' }}>
        <SlotRenderer slot={slot} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
