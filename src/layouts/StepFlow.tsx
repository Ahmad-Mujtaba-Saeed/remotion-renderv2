import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { IconItem, Scene } from '../types';
import { IconStroke } from '../icons/IconStroke';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeInOutSine, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';
import { KineticText } from '../components/KineticText';

/**
 * step_flow (copilot.md §5.8): a process as 3-5 numbered nodes — solid
 * accent circles with ink numerals — joined by a hairline that DRAWS first
 * and leads each node's pop (the line is the story; nodes land on arrival).
 * Each step carries an optional library icon and a ≤4-word label. Horizontal
 * in 16:9, a vertical rail in 9:16. Silent per §1.3 — the motion carries it.
 */
export const StepFlow: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_steps'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;
  const steps = (slot.items ?? [])
    .filter((it): it is IconItem => typeof it === 'object' && it !== null)
    .slice(0, 5);
  if (steps.length < 3) return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  const stepGap = f30(fps, 14);
  const firstAt = f30(fps, 14);
  const nodeAt = (i: number): number => firstAt + i * stepGap;
  const badge = 84 * u;

  const nodeEl = (step: IconItem, i: number): React.ReactNode => {
    const pop = spring({
      frame: Math.max(0, frame - nodeAt(i)),
      fps,
      config: SPRINGS.pop,
      durationInFrames: Math.round(fps * 0.4),
    });
    const labelP = easeOutQuint(clamp01((frame - nodeAt(i) - f30(fps, 4)) / f30(fps, 10)));
    // The connecting segment INTO this node draws just before it pops.
    const segP = i === 0 ? 1 : easeInOutSine(clamp01((frame - nodeAt(i - 1) - f30(fps, 4)) / stepGap));
    return (
      <React.Fragment key={i}>
        {i > 0 ? (
          <div
            style={{
              flex: 1,
              ...(portrait
                ? { width: 2, minHeight: 60 * u, alignSelf: 'center' }
                : { height: 2, alignSelf: 'center' }),
              background: hairline(theme, 0.12),
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: hairline(theme, 0.34),
                transformOrigin: portrait ? 'center top' : 'left center',
                transform: portrait ? `scaleY(${segP})` : `scaleX(${segP})`,
              }}
            />
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexDirection: portrait ? 'row' : 'column',
            alignItems: 'center',
            gap: 20 * u,
            opacity: Math.min(1, pop),
            transform: `scale(${Math.min(1.06, pop)})`,
            width: portrait ? undefined : 220 * u,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: badge,
              height: badge,
              borderRadius: '50%',
              background: theme.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: displayFont,
              fontWeight: 900,
              fontSize: 38 * u,
              color: inkOn(theme.accent),
              flexShrink: 0,
            }}
          >
            {i + 1}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: portrait ? 'row' : 'column',
              alignItems: 'center',
              gap: 12 * u,
            }}
          >
            {step.icon ? (
              <IconStroke
                name={step.icon}
                progress={clamp01((frame - nodeAt(i) - f30(fps, 2)) / f30(fps, 10))}
                size={52 * u}
                color={theme.text}
              />
            ) : null}
            <div
              style={{
                fontFamily: BODY_FONT,
                fontSize: 28 * u,
                fontWeight: 700,
                textAlign: portrait ? 'left' : 'center',
                lineHeight: 1.25,
                color: theme.text,
                opacity: labelP,
                transform: `translateY(${(1 - labelP) * 10 * u}px)`,
                maxWidth: (portrait ? 480 : 210) * u,
              }}
            >
              {step.label}
            </div>
          </div>
        </div>
      </React.Fragment>
    );
  };

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '7%', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: 1500 * u, textAlign: 'center' }}>
        {kicker ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 24 * u,
              letterSpacing: 4 * u,
              textTransform: 'uppercase',
              color: theme.accent,
              marginBottom: 14 * u,
              opacity: headIn,
            }}
          >
            {kicker}
          </div>
        ) : null}
        {heading ? (
          <h1
            style={{
              margin: `0 0 ${54 * u}px 0`,
              fontFamily: displayFont,
              fontWeight: 900,
              fontSize: 60 * u,
              lineHeight: 1.05,
              color: theme.text,
            }}
          >
            <KineticText text={heading} highlight={meta.style?.highlight} />
          </h1>
        ) : null}

        <div
          style={{
            display: 'flex',
            flexDirection: portrait ? 'column' : 'row',
            alignItems: portrait ? 'flex-start' : 'stretch',
            justifyContent: 'center',
            gap: portrait ? 34 * u : 0,
          }}
        >
          {steps.map((s, i) => nodeEl(s, i))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
