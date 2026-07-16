import React from 'react';
import { AbsoluteFill, Img, useVideoConfig, spring } from 'remotion';
import { Scene, ScenarioEntity, ScenarioConnector } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, inkOn, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeInOutQuint, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';
import { KineticText } from '../components/KineticText';
import { InlineMathText } from '../math/mathText';
import { IconStroke } from '../icons/IconStroke';
import { SfxCue } from '../sfx';

/**
 * scenario_diagram — the word-problem SETUP, drawn the way a teacher sketches
 * it before touching the algebra: each actor is a labelled box (car, tank,
 * worker) with its GIVEN value written underneath, the actors sit on one
 * baseline, and the relationship rides an arrow between them. The question
 * mark of the problem lands last as an accent chip.
 *
 * The boxes pop in reading order, each connector draws toward the next box,
 * so the problem is assembled in front of the viewer — then the working that
 * follows has something to point back at.
 *
 * Flat design rules hold: outlines, solid fills, stroke draws; no shadows.
 * Portrait stacks the chain vertically (arrows point down).
 */
export const ScenarioDiagram: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_scenario'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;
  const entities: ScenarioEntity[] = (slot.entities ?? [])
    .filter((e): e is ScenarioEntity => !!e && typeof e === 'object' && (e.label ?? '').trim() !== '')
    .slice(0, 4);
  if (entities.length < 2) return null;
  const connectors: ScenarioConnector[] = slot.connectors ?? [];
  const question = (slot.question ?? '').trim();
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();

  const portrait = height > width;
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  // ---- Beat clock: box 0 → connector 0 → box 1 → ... → question ------------
  const boxAt = (i: number): number => f30(fps, (heading ? 18 : 10) + i * 22);
  const connAt = (i: number): number => boxAt(i) + f30(fps, 11);
  const questionAt = boxAt(entities.length - 1) + f30(fps, 14);

  const n = entities.length;
  const boxW = (portrait ? 620 : Math.min(360, 1180 / n)) * u;
  const boxH = (portrait ? 210 : 230) * u;
  const gap = (portrait ? 150 : Math.min(230, 640 / (n - 1))) * u;

  const entity = (e: ScenarioEntity, i: number): React.ReactNode => {
    const pop = spring({
      frame: Math.max(0, frame - boxAt(i)),
      fps,
      config: SPRINGS.settle,
      durationInFrames: Math.round(fps * 0.4),
    });
    const iconP = clamp01((frame - boxAt(i) - f30(fps, 2)) / f30(fps, 12));
    const valueP = easeOutQuint(clamp01((frame - boxAt(i) - f30(fps, 6)) / f30(fps, 9)));
    const value = (e.value ?? '').trim();

    // A cut-out sprite sits ON the diagram as a free object (the whole point
    // of the alpha channel) — no box around it. The FIRST entity drifts a
    // little toward its connector once the arrow is drawn: the car pulls
    // away toward the destination. Transform-only, flat-law safe.
    const sprite = (e.sprite_url ?? '').trim();
    const drift =
      sprite && i === 0 && n > 1 && !portrait
        ? easeInOutQuint(clamp01((frame - connAt(0) - f30(fps, 10)) / f30(fps, 70))) * 22 * u
        : 0;

    return (
      <div
        key={`e${i}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14 * u,
          opacity: Math.min(1, pop * 1.3),
          transform: `scale(${0.92 + 0.08 * Math.min(1.04, pop)}) translateX(${drift}px)`,
        }}
      >
        {sprite ? (
          <div
            style={{
              width: boxW,
              height: boxH,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8 * u,
            }}
          >
            <Img
              src={sprite}
              style={{
                maxWidth: '92%',
                maxHeight: boxH - 44 * u,
                objectFit: 'contain',
                opacity: Math.min(1, iconP * 1.6),
              }}
            />
            <div
              style={{
                fontFamily: displayFont,
                fontWeight: 800,
                fontSize: 30 * u,
                color: theme.text,
                textAlign: 'center',
              }}
            >
              {e.label}
            </div>
          </div>
        ) : (
          <div
            style={{
              width: boxW,
              height: boxH,
              border: `${Math.max(2.5, 4 * u)}px solid ${theme.text}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10 * u,
              // Transparent so a board render keeps its graph paper showing
              // through — the box reads as drawn ON the surface, not stuck over
              // it. Full-frame renders sit on the ambient background anyway.
              background: 'transparent',
            }}
          >
            {e.icon ? <IconStroke name={e.icon} progress={iconP} size={64 * u} color={theme.accent} strokeWidth={2} /> : null}
            <div
              style={{
                fontFamily: displayFont,
                fontWeight: 800,
                fontSize: 34 * u,
                color: theme.text,
                textAlign: 'center',
                padding: `0 ${16 * u}px`,
              }}
            >
              {e.label}
            </div>
          </div>
        )}
        {value ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 27 * u,
              color: theme.accent,
              opacity: valueP,
              transform: `translateY(${(1 - valueP) * 8 * u}px)`,
              textAlign: 'center',
            }}
          >
            <InlineMathText text={value} />
          </div>
        ) : null}
      </div>
    );
  };

  const connector = (i: number): React.ReactNode => {
    const c = connectors[i] ?? {};
    const style = c.style === 'line' || c.style === 'both' ? c.style : 'arrow';
    const p = easeInOutQuint(clamp01((frame - connAt(i)) / f30(fps, 12)));
    const labelP = easeOutQuint(clamp01((frame - connAt(i) - f30(fps, 6)) / f30(fps, 9)));
    const label = (c.label ?? '').trim();
    const sub = (c.sub ?? '').trim();
    const L = portrait ? 110 * u : gap;
    const T = 12 * u; // arrowhead size
    const sw = Math.max(2.5, 4 * u);

    // Horizontal in landscape, vertical in portrait — one SVG each way.
    const svg = portrait ? (
      <svg width={T * 3} height={L} viewBox={`0 0 ${T * 3} ${L}`} fill="none" style={{ overflow: 'visible' }}>
        <line x1={T * 1.5} y1={0} x2={T * 1.5} y2={L * p - (style !== 'line' ? T : 0)} stroke={theme.text} strokeWidth={sw} strokeLinecap="round" />
        {style !== 'line' && p > 0.75 ? (
          <polyline
            points={`${T * 0.6},${L - T * 1.4} ${T * 1.5},${L - 2} ${T * 2.4},${L - T * 1.4}`}
            stroke={theme.text}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={clamp01((p - 0.75) / 0.25)}
          />
        ) : null}
      </svg>
    ) : (
      <svg width={L} height={T * 3} viewBox={`0 0 ${L} ${T * 3}`} fill="none" style={{ overflow: 'visible' }}>
        <line x1={0} y1={T * 1.5} x2={L * p - (style !== 'line' ? T : 0)} y2={T * 1.5} stroke={theme.text} strokeWidth={sw} strokeLinecap="round" />
        {style === 'both' ? (
          <polyline
            points={`${T * 1.4},${T * 0.6} ${2},${T * 1.5} ${T * 1.4},${T * 2.4}`}
            stroke={theme.text}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={clamp01(p * 2)}
          />
        ) : null}
        {style !== 'line' && p > 0.75 ? (
          <polyline
            points={`${L - T * 1.4},${T * 0.6} ${L - 2},${T * 1.5} ${L - T * 1.4},${T * 2.4}`}
            stroke={theme.text}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={clamp01((p - 0.75) / 0.25)}
          />
        ) : null}
      </svg>
    );

    return (
      <div
        key={`c${i}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8 * u,
          // Sit the connector on the boxes' vertical middle, not the column's
          // (values under a box would otherwise push the line off-axis).
          alignSelf: 'flex-start',
          marginTop: portrait ? 0 : boxH / 2 - T * 1.5,
        }}
      >
        {label ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 25 * u,
              color: theme.muted,
              opacity: labelP,
              whiteSpace: 'nowrap',
            }}
          >
            <InlineMathText text={label} />
          </div>
        ) : null}
        {svg}
        {sub ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 23 * u,
              color: theme.accent,
              opacity: labelP,
              whiteSpace: 'nowrap',
            }}
          >
            <InlineMathText text={sub} />
          </div>
        ) : null}
      </div>
    );
  };

  const chain: React.ReactNode[] = [];
  entities.forEach((e, i) => {
    chain.push(entity(e, i));
    if (i < n - 1) chain.push(connector(i));
  });

  const qPop = spring({
    frame: Math.max(0, frame - questionAt),
    fps,
    config: SPRINGS.pop,
    durationInFrames: Math.round(fps * 0.4),
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '5%', boxSizing: 'border-box' }}>
      {question ? <SfxCue name="stamp" at={questionAt + f30(fps, 2)} volume={0.8} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 * u, maxWidth: '100%' }}>
        {kicker ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 25 * u,
              letterSpacing: 4.5 * u,
              textTransform: 'uppercase',
              color: theme.accent,
              opacity: headIn,
              transform: `translateY(${(1 - headIn) * 10 * u}px)`,
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
              fontSize: (portrait ? 50 : 56) * u,
              lineHeight: 1.05,
              color: theme.text,
              textAlign: 'center',
            }}
          >
            <KineticText text={heading} highlight={meta.style?.highlight} />
          </h1>
        ) : null}

        <div
          style={{
            display: 'flex',
            flexDirection: portrait ? 'column' : 'row',
            alignItems: 'center',
            gap: 18 * u,
          }}
        >
          {chain}
        </div>

        {question ? (
          <div
            style={{
              background: theme.accent,
              color: inkOn(theme.accent),
              fontFamily: displayFont,
              fontWeight: 800,
              fontSize: 34 * u,
              padding: `${12 * u}px ${26 * u}px`,
              opacity: Math.min(1, qPop * 1.4),
              transform: `scale(${0.9 + 0.1 * Math.min(1.05, qPop)})`,
            }}
          >
            <InlineMathText text={question} />
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
