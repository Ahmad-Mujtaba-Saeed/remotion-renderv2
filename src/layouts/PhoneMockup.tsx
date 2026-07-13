import React from 'react';
import { AbsoluteFill, spring, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { MediaSlot } from '../components/MediaSlot';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, hairline, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeOutCubic } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';

/**
 * phone_mockup (copilot.md §5.13): screen content presented inside a pure-CSS
 * flat device frame — a phone (rounded rect, hairline bezel, notch dot) or a
 * browser window (flat chrome bar, three dots, mono URL). The media inside
 * gets a slow push. No shadows — separation comes from a paper-offset border
 * block behind the device (§1.1 Flat Design Law).
 */
export const PhoneMockup: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_screen'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;
  const browser = slot.frame === 'browser';
  const portraitVideo = height > width;

  // Device proportions (design units): a tall phone, a wide browser window.
  // In a portrait video the browser narrows so it still fits with margins.
  const devW = browser ? (portraitVideo ? 880 : 1240) : 460;
  const devH = browser ? (portraitVideo ? 620 : 780) : 940;
  const radius = browser ? 18 : 56;
  const kicker = (meta.style?.kicker ?? '').trim();

  // One decisive settle: the device rises and lands; the offset paper block
  // arrives a beat later so the layering reads.
  const rise = spring({ frame: Math.max(0, frame - f30(fps, 2)), fps, config: SPRINGS.settle });
  const offsetIn = easeOutCubic(clamp01((frame - f30(fps, 8)) / f30(fps, 10)));

  // The media inside always gets the slow push — its assigned pan would
  // fight the frame metaphor (a screenshot doesn't pan itself).
  const screen = { ...slot, label: undefined, camera_move: 'slow_zoom_in' as const };

  const urlText = (slot.label || slot.asset_request?.description || 'example.com')
    .toLowerCase()
    .replace(/[^a-z0-9./-]+/g, ' ')
    .trim()
    .split(' ')[0];

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      {kicker ? (
        <div
          style={{
            position: 'absolute',
            top: '6%',
            fontFamily: MONO_FONT,
            fontSize: 24 * u,
            letterSpacing: 4 * u,
            textTransform: 'uppercase',
            color: theme.accent,
            opacity: easeOutCubic(clamp01(frame / f30(fps, 12))),
          }}
        >
          {kicker}
        </div>
      ) : null}

      <div
        style={{
          position: 'relative',
          width: devW * u,
          height: devH * u,
          opacity: Math.min(1, rise * 1.4),
          transform: `translateY(${(1 - rise) * 60 * u}px)`,
        }}
      >
        {/* Paper-offset separation block (flat depth, no shadow). */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate(${16 * u * offsetIn}px, ${16 * u * offsetIn}px)`,
            borderRadius: radius * u,
            background: theme.accent,
            opacity: 0.9 * offsetIn,
          }}
        />

        {/* The device body. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: radius * u,
            background: theme.panel,
            border: `${Math.max(1, Math.round(2 * u))}px solid ${hairline(theme, 0.3)}`,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {browser ? (
            // Browser chrome: flat bar + three dots + URL text.
            <div
              style={{
                height: 64 * u,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 12 * u,
                padding: `0 ${24 * u}px`,
                borderBottom: `1px solid ${hairline(theme, 0.18)}`,
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 14 * u,
                    height: 14 * u,
                    borderRadius: '50%',
                    background: i === 0 ? theme.accent : hairline(theme, 0.3),
                  }}
                />
              ))}
              <div
                style={{
                  marginLeft: 14 * u,
                  flex: 1,
                  padding: `${8 * u}px ${18 * u}px`,
                  background: theme.bg_from,
                  border: `1px solid ${hairline(theme, 0.14)}`,
                  fontFamily: MONO_FONT,
                  fontSize: 20 * u,
                  color: theme.muted,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                {urlText}
              </div>
            </div>
          ) : (
            // Phone bezel top: a single notch dot.
            <div
              style={{
                height: 46 * u,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 12 * u,
                  height: 12 * u,
                  borderRadius: '50%',
                  background: hairline(theme, 0.34),
                }}
              />
            </div>
          )}

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <MediaSlot slot={screen} />
          </div>
        </div>
      </div>

      {slot.label ? (
        <div
          style={{
            position: 'absolute',
            bottom: '6%',
            fontFamily: MONO_FONT,
            fontSize: 26 * u,
            letterSpacing: 3 * u,
            textTransform: 'uppercase',
            color: theme.muted,
            opacity: easeOutCubic(clamp01((frame - f30(fps, 14)) / f30(fps, 10))),
          }}
        >
          {slot.label}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
