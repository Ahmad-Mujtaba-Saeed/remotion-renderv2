import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { IconItem, Scene } from '../types';
import { IconStroke } from '../icons/IconStroke';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01, easeInOutSine, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { useCardReveal } from '../motion/cardReveal';
import { KineticText } from '../components/KineticText';
import { calloutRevealSchedule } from '../components/CalloutLayer';

/**
 * cycle_diagram — step_flow's circular sibling: 3-6 nodes on a ring, each an
 * accent disc (library icon or its number) with a label sitting OUTSIDE the
 * ring, joined by accent arcs that draw clockwise around the circle. The
 * LAST arc closes the loop back to node 1 — that return stroke is the whole
 * point of the card (water cycle, habit loop, supply chain: it repeats).
 * Nodes land on the narration words that name them when timings exist.
 * Silent per §1.3 — the drawing arcs carry the motion. Flat throughout.
 */
export const CycleDiagram: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_cycle'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();
  const reveal = useCardReveal();

  if (!slot) return null;
  const items = (slot.items ?? [])
    .filter((it): it is IconItem => typeof it === 'object' && it !== null && (it as IconItem).label !== undefined)
    .slice(0, 6);
  if (items.length < 3) return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const headIn = reveal.ease(clamp01(frame / reveal.headFrames));

  const n = items.length;
  const discR = 52 * u;
  const R = (portrait ? 300 : 265) * u;
  // Node 1 always sits at 12 o'clock, so there is ALWAYS a label above the
  // ring (and usually one below) — the stage reserves that zone instead of
  // letting the top label climb into the heading.
  const labelZone = 88 * u;
  const stageS = 2 * (R + discR);
  const stageH = stageS + 2 * labelZone;
  const cx = stageS / 2;
  const cy = labelZone + stageS / 2;

  const at = calloutRevealSchedule(
    items.map((it) => it.label ?? ''),
    scene.narration_words,
    fps,
    { first: reveal.first, step: reveal.step }
  );
  const step = f30(fps, 14);

  // Node i sits at angle θ_i, clockwise from 12 o'clock (screen y is down,
  // so increasing θ IS clockwise).
  const angle = (i: number): number => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const px = (a: number): number => cx + R * Math.cos(a);
  const py = (a: number): number => cy + R * Math.sin(a);

  // Arc from node i to node (i+1)%n, trimmed clear of both discs.
  const gapA = (discR + 12 * u) / R;
  const spanA = (2 * Math.PI) / n - 2 * gapA;

  const arcs = items.map((_, i) => {
    const a1 = angle(i) + gapA;
    const a2 = a1 + spanA;
    const len = R * spanA;
    // The closing arc (last node → node 1) starts once the last node landed.
    const from = at[i] + f30(fps, 5);
    const p = easeInOutSine(clamp01((frame - from) / f30(fps, i === n - 1 ? 14 : 10)));
    // Tangent of clockwise travel at the arc's end, for the arrow barbs.
    const ang = Math.atan2(Math.cos(a2), -Math.sin(a2));
    const headP = easeOutQuint(clamp01((frame - from - f30(fps, 8)) / f30(fps, 6)));
    return { a1, a2, len, p, ang, headP };
  });

  const strokeW = Math.max(3, 3.4 * u);
  const hw = strokeW * 3.2;

  const labelStyle = (a: number): React.CSSProperties => {
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const off = discR + 18 * u;
    const maxW = (portrait ? 250 : 300) * u;
    // Quadrant placement: side nodes label beside, top/bottom label above/
    // below — radial text never collides with the ring.
    if (Math.abs(cos) > 0.55) {
      const left = cos > 0;
      return {
        left: px(a) + (left ? off : -off - maxW),
        top: py(a) - 40 * u,
        width: maxW,
        textAlign: left ? 'left' : 'right',
        justifyContent: left ? 'flex-start' : 'flex-end',
      };
    }
    const below = sin > 0;
    return {
      left: px(a) - maxW / 2,
      top: below ? py(a) + off : py(a) - off - 76 * u,
      width: maxW,
      textAlign: 'center',
      justifyContent: 'center',
      alignItems: below ? 'flex-start' : 'flex-end',
    };
  };

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '4%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {(kicker || heading) && (
          <div style={{ textAlign: 'center', marginBottom: 30 * u }}>
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
                  fontSize: fitText(heading, {
                  width: width * (portrait ? 0.86 : 0.78),
                  max: 58 * u,
                  min: 30 * u,
                  maxLines: 2,
                  font: displayFont,
                  weight: 900,
                }),
                  lineHeight: 1.05,
                  color: theme.text,
                }}
              >
                <KineticText text={heading} highlight={meta.style?.highlight} />
              </h1>
            ) : null}
          </div>
        )}

        <div style={{ position: 'relative', width: stageS, height: stageH }}>
          <svg
            width={stageS}
            height={stageH}
            viewBox={`0 0 ${stageS} ${stageH}`}
            style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
          >
            {arcs.map((arc, i) => {
              if (arc.p <= 0) return null;
              const x2 = px(arc.a2);
              const y2 = py(arc.a2);
              const b1 = arc.ang + (Math.PI * 5) / 6;
              const b2 = arc.ang - (Math.PI * 5) / 6;
              // The nib: a pen tip riding the draw frontier while the arc grows,
              // gone the instant the arrowhead lands — the same write-cursor the
              // flowchart cards use (src/motion/draw.ts), placed by angle here
              // since the arc is swept, not a polyline.
              const nibA = arc.a1 + (arc.a2 - arc.a1) * arc.p;
              const showNib = arc.p > 0.03 && arc.p < 0.96;
              return (
                <g key={i}>
                  <path
                    d={`M ${px(arc.a1)} ${py(arc.a1)} A ${R} ${R} 0 0 1 ${x2} ${y2}`}
                    fill="none"
                    stroke={theme.accent}
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                    strokeDasharray={arc.len}
                    strokeDashoffset={(1 - arc.p) * arc.len}
                  />
                  {arc.headP > 0 ? (
                    <path
                      d={`M ${x2 + Math.cos(b1) * hw} ${y2 + Math.sin(b1) * hw} L ${x2} ${y2} L ${x2 + Math.cos(b2) * hw} ${y2 + Math.sin(b2) * hw}`}
                      fill="none"
                      stroke={theme.accent}
                      strokeWidth={strokeW}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={arc.headP}
                    />
                  ) : null}
                  {showNib ? (
                    <circle cx={px(nibA)} cy={py(nibA)} r={Math.max(4, strokeW * 1.2)} fill={theme.accent} />
                  ) : null}
                </g>
              );
            })}
          </svg>

          {items.map((item, i) => {
            const a = angle(i);
            const pop = spring({
              frame: Math.max(0, frame - at[i]),
              fps,
              config: reveal.config,
              durationInFrames: reveal.popFrames,
            });
            const labelP = easeOutQuint(clamp01((frame - at[i] - f30(fps, 4)) / f30(fps, 10)));
            return (
              <React.Fragment key={i}>
                <div
                  style={{
                    position: 'absolute',
                    left: px(a) - discR,
                    top: py(a) - discR,
                    width: discR * 2,
                    height: discR * 2,
                    borderRadius: '50%',
                    background: theme.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: Math.min(1, pop),
                    transform: `scale(${Math.min(1.06, pop)})`,
                  }}
                >
                  {item.icon ? (
                    <IconStroke
                      life="float"
                      seed={i}
                      name={item.icon}
                      progress={clamp01((frame - at[i] - f30(fps, 2)) / f30(fps, 10))}
                      size={discR * 1.06}
                      color={inkOn(theme.accent)}
                    />
                  ) : (
                    <span
                      style={{
                        fontFamily: displayFont,
                        fontWeight: 900,
                        fontSize: 40 * u,
                        color: inkOn(theme.accent),
                      }}
                    >
                      {i + 1}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    display: 'flex',
                    fontFamily: BODY_FONT,
                    fontSize: 27 * u,
                    fontWeight: 700,
                    lineHeight: 1.25,
                    color: theme.text,
                    opacity: labelP,
                    transform: `translateY(${(1 - labelP) * 10 * u}px)`,
                    ...labelStyle(a),
                  }}
                >
                  {item.label}
                </div>
              </React.Fragment>
            );
          })}

          {caption ? (
            <div
              style={{
                position: 'absolute',
                left: cx - R * 0.62,
                top: cy - R * 0.3,
                width: R * 1.24,
                height: R * 0.6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                fontFamily: MONO_FONT,
                fontSize: 24 * u,
                letterSpacing: 1.4 * u,
                lineHeight: 1.4,
                color: theme.muted,
                opacity: headIn,
              }}
            >
              {caption}
            </div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};
