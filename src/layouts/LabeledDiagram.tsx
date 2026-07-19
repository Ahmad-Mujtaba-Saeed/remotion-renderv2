import React from 'react';
import { AbsoluteFill, Img, spring, useVideoConfig } from 'remotion';
import { Scene, Slot } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, BODY_FONT, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeOutCubic, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';
import { KineticText } from '../components/KineticText';
import { CalloutLayer, calloutRevealSchedule } from '../components/CalloutLayer';

/**
 * labeled_diagram — the canonical "how X works" visual: one contained hero
 * image with 2-4 leader-line part labels revealing in narration order (each
 * label lands as the voice names it; even spread without timings).
 *
 * The image is ALWAYS contained — a diagram cropped by object-fit: cover is
 * a diagram missing a part — and holds still: no camera move, the labels are
 * the motion. When the VLM positioning step produced no coordinates the
 * labels fall back to a legend row under the image, so the card degrades
 * into "image + neat key" instead of guessing where parts are.
 */
export const LabeledDiagram: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot: Slot | undefined =
    scene.slots['slot_diagram'] ??
    Object.values(scene.slots).find((s) => s.content_type === 'image');
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;
  const url = slot.asset_ref?.url;
  const portrait = height > width;

  const callouts = (slot.callouts ?? []).filter((c) => (c.text ?? '').trim() !== '').slice(0, 4);
  const legend = callouts.length
    ? []
    : (slot.callout_suggestions ?? []).map((s) => s.trim()).filter((s) => s !== '').slice(0, 4);

  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));
  const settle = spring({ frame: Math.max(0, frame), fps, config: SPRINGS.settle });

  // Labels land where the narration names them; the fallback spread walks the
  // scene's middle so the last label never fights the outgoing transition.
  const total = Math.max(1, Math.round((scene.duration_seconds || 6) * fps));
  const texts = callouts.length ? callouts.map((c) => c.text) : legend;
  const reveals = calloutRevealSchedule(texts, scene.narration_words, fps, {
    first: Math.max(f30(fps, 22), Math.round(total * 0.2)),
    step: Math.round((total * 0.65) / Math.max(1, texts.length)),
  });

  const mediaW = slot.asset_ref?.width ?? null;
  const mediaH = slot.asset_ref?.height ?? null;
  const mediaAspect = mediaW && mediaH ? mediaW / mediaH : null;

  return (
    <AbsoluteFill
      style={{
        padding: portrait ? '10% 6%' : '5% 7%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 34 * u,
      }}
    >
      {(kicker || heading) && (
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          {kicker ? (
            <div
              style={{
                fontFamily: MONO_FONT,
                fontSize: 24 * u,
                letterSpacing: 4 * u,
                textTransform: 'uppercase',
                color: theme.accent,
                marginBottom: 12 * u,
                opacity: headIn,
              }}
            >
              {kicker}
            </div>
          ) : null}
          {heading ? (
            <h1
              style={{
                margin: 0,
                fontFamily: displayFont,
                fontWeight: 900,
                fontSize: (portrait ? 54 : 60) * u,
                lineHeight: 1.05,
                color: theme.text,
              }}
            >
              <KineticText text={heading} highlight={meta.style?.highlight} />
            </h1>
          ) : null}
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          background: theme.panel,
          border: `1px solid ${hairline(theme, 0.14)}`,
          opacity: easeOutCubic(clamp01(frame / f30(fps, 10))),
          transform: `scale(${1.02 - 0.02 * settle})`,
        }}
      >
        {url ? (
          <Img
            src={url}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.muted,
              fontSize: 26 * u,
              fontFamily: MONO_FONT,
              textTransform: 'uppercase',
              letterSpacing: 2 * u,
              textAlign: 'center',
              padding: 48 * u,
              boxSizing: 'border-box',
            }}
          >
            {slot.asset_request?.description || 'Diagram'}
          </div>
        )}
        {callouts.length ? (
          <CalloutLayer
            callouts={callouts}
            media={{ mediaAspect, fit: 'contain' }}
            revealFrames={reveals}
          />
        ) : null}
      </div>

      {legend.length ? (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 18 * u,
          }}
        >
          {legend.map((text, i) => {
            const p = easeOutQuint(clamp01((frame - reveals[i]) / f30(fps, 12)));
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14 * u,
                  padding: `${14 * u}px ${24 * u}px`,
                  background: theme.panel,
                  border: `1px solid ${hairline(theme, 0.22)}`,
                  fontFamily: BODY_FONT,
                  fontSize: 28 * u,
                  fontWeight: 700,
                  color: theme.text,
                  opacity: p,
                  transform: `translateY(${(1 - p) * 22 * u}px)`,
                }}
              >
                <span
                  style={{
                    width: 14 * u,
                    height: 14 * u,
                    borderRadius: '50%',
                    background: theme.accent,
                    flexShrink: 0,
                  }}
                />
                {text}
              </div>
            );
          })}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
