import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeOutExpo, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SfxCue } from '../sfx';

/**
 * progress_meter (copilot.md §5.11): one horizontal track — a hairline
 * outline — fills with solid accent (22f, easeOutQuint) while the giant
 * percentage counts up above it. For the "78% of players said…" beat. A
 * single chime lands when the meter completes (§6.5).
 */
export const ProgressMeter: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_meter'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps } = useVideoConfig();
  const { frame } = useSceneClock();
  const win = useSceneWindow();
  const meta = useSceneMeta();

  if (!slot) return null;
  const pct = Math.max(0, Math.min(100, Number(slot.value_pct ?? 0)));
  if (!pct) return null;

  const unit = (slot.unit ?? '%').trim() || '%';
  const label = (slot.label ?? '').trim();
  const kicker = (meta.style?.kicker ?? '').trim();

  const fillAt = f30(fps, 10);
  const fillDur = f30(fps, 22);
  const fillP = easeOutQuint(clamp01((frame - fillAt) / fillDur));
  const rollP = easeOutExpo(clamp01((frame - fillAt) / f30(fps, 24)));
  const shown = Math.round(pct * rollP);
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));
  const at = win?.start ?? 0;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '7%', boxSizing: 'border-box' }}>
      <SfxCue name="chime" at={at + fillAt + fillDur} volume={1} />

      <div style={{ width: '100%', maxWidth: 1240 * u, textAlign: 'center' }}>
        {kicker ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 26 * u,
              letterSpacing: 4 * u,
              textTransform: 'uppercase',
              color: theme.accent,
              marginBottom: 26 * u,
              opacity: headIn,
            }}
          >
            {kicker}
          </div>
        ) : null}

        <div
          style={{
            fontFamily: displayFont,
            fontWeight: 800,
            fontSize: 190 * u,
            lineHeight: 1,
            letterSpacing: -3 * u,
            color: theme.text,
            fontVariantNumeric: 'tabular-nums',
            opacity: Math.min(1, headIn + rollP),
          }}
        >
          {shown}
          <span style={{ fontSize: 90 * u, color: theme.accent }}>{unit}</span>
        </div>

        {/* The track: hairline outline, solid accent fill. */}
        <div
          style={{
            marginTop: 48 * u,
            height: 34 * u,
            border: `2px solid ${hairline(theme, 0.3)}`,
            padding: 4 * u,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct * fillP}%`,
              background: theme.accent,
            }}
          />
        </div>

        {label ? (
          <div
            style={{
              marginTop: 34 * u,
              fontFamily: BODY_FONT,
              fontSize: 34 * u,
              fontWeight: 600,
              color: theme.muted,
              opacity: easeOutQuint(clamp01((frame - fillAt - f30(fps, 8)) / f30(fps, 12))),
            }}
          >
            {label}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
