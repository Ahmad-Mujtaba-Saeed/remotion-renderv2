import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, VennSet } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useSurfaceStyle } from '../components/Surface';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';
import { KineticText } from '../components/KineticText';
import { calloutRevealSchedule } from '../components/CalloutLayer';

/**
 * venn_card — the "what do these SHARE" beat. Two or three outlined circles
 * overlap, the shared middle tints in accent, each set's label lands as the
 * narration names it, and the overlap label stamps in LAST because it is the
 * punchline ("cheap, fast, good — pick two").
 *
 * Geometry is pure data: circle count decides the arrangement (two side by
 * side, three in a triangle), so the card is fully deterministic with no
 * measure pass. The shared region is a real intersection, drawn by nesting SVG
 * clip paths rather than faked with a blend mode — three nested clips give the
 * true centre region.
 *
 * Flat law: hairline outlines, one solid accent tint for the intersection, a
 * panel chip for the overlap label. No gradient, glow or shadow. Silent per
 * §1.3.
 */
export const VennCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_venn'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const surface = useSurfaceStyle(false);
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;

  const sets: VennSet[] = (slot.sets ?? [])
    .filter((s) => s && (s.label ?? '').trim() !== '')
    .slice(0, 3);
  if (sets.length < 2) return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const overlapLabel = (slot.overlap_label ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  // ---- Geometry ------------------------------------------------------------
  const three = sets.length === 3;
  const labelFs = (portrait ? 27 : 30) * u;
  const stageW = width * (portrait ? 0.9 : 0.66);
  const maxH = height * (portrait ? 0.42 : 0.52);

  /*
   * The three-circle arrangement pushes each label OUTWARD from the ring, and
   * the top circle's label therefore sits above everything else. Without a
   * reserved zone its box lands at a negative y and strikes the heading — the
   * probe still caught exactly that. So the label band is budgeted into the
   * height BEFORE the radius is solved, rather than hoped for afterwards.
   *
   * Vertical extent of the triangle = (top label band) + ringR + 0.92r
   * + 0.5·ringR + r + margin, with ringR = 0.62r, which collapses to
   * 2.85r + 1.7·labelFs.
   */
  const wFactor = three ? 3.15 : 3.05;
  const labelBand = three ? labelFs * 2.2 : 0;
  const r = three
    ? Math.min(stageW / wFactor, Math.max(40, (maxH - labelBand) / 2.93))
    : Math.min(stageW / wFactor, maxH / 2.15);
  const ringR = three ? r * 0.62 : 0;
  /*
   * Two circles read best with each label INSIDE its outer lobe. Three cannot:
   * at 0.92r the label centre lands within a hair of the arc and the stroke
   * draws straight through the word (the probe still showed it crossing out
   * "Cheap"), so the trio pushes its labels clear of the circle entirely.
   */
  const outPush = three ? r + labelFs * 0.8 : r * 0.52;

  const cx = stageW / 2;
  const cy = three ? ringR + outPush + labelFs * 0.95 : r * 1.075;
  const stageH = three
    ? cy + Math.max(ringR * 0.5 + r, outPush * 0.5 + labelFs * 1.7) + labelFs * 0.4
    : r * 2.15;

  /** Circle centres in stage coordinates. */
  const centres = three
    ? [
        { x: cx, y: cy - ringR },
        { x: cx + ringR * Math.cos(Math.PI / 6), y: cy + ringR * Math.sin(Math.PI / 6) },
        { x: cx - ringR * Math.cos(Math.PI / 6), y: cy + ringR * Math.sin(Math.PI / 6) },
      ]
    : [
        { x: cx - r * 0.525, y: cy },
        { x: cx + r * 0.525, y: cy },
      ];

  // ---- Choreography --------------------------------------------------------
  const circleAt = f30(fps, 6);
  const minGap = f30(fps, 8);
  const rawAt = calloutRevealSchedule(
    sets.map((s) => s.label.trim()),
    scene.narration_words,
    fps,
    { first: circleAt + f30(fps, 12), step: f30(fps, 11) }
  );

  /*
   * A set label is matched to the first narration word that shares its opening
   * token — but that word can RECUR late ("…breathing air in the sea." at 9.1s
   * of a 10s scene), which would land the second circle a heartbeat before the
   * scene cuts and push the overlap punchline off the end entirely. Pull the
   * schedule back so every set is on screen by 55% of the window and the
   * overlap by 72%, preserving both order and spacing. Clamping each entry
   * against the room its successors still need means re-imposing the gap below
   * can never push a label past the bound again.
   */
  const lastSetBy = Math.round(durationInFrames * 0.55);
  const at = rawAt.map((f, i) => Math.min(f, lastSetBy - (rawAt.length - 1 - i) * minGap));
  for (let i = 1; i < at.length; i++) {
    at[i] = Math.max(at[i], at[i - 1] + minGap);
  }

  // The overlap is the point of the card, so it lands after the last set — but
  // never so late that the viewer does not get to read it.
  const overlapAt = Math.min(
    Math.max(...at) + f30(fps, 10),
    Math.round(durationInFrames * 0.72)
  );
  const tintP = easeOutQuint(clamp01((frame - overlapAt + f30(fps, 6)) / f30(fps, 12)));

  const capFs = labelFs * 0.66;
  const overlapFs = (portrait ? 26 : 29) * u;

  const clipId = `venn-${scene.scene_id ?? 'x'}`;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '5%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
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
                  max: 56 * u,
                  min: 29 * u,
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

        <div style={{ position: 'relative', width: stageW, height: stageH }}>
          <svg
            width={stageW}
            height={stageH}
            viewBox={`0 0 ${stageW} ${stageH}`}
            style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
          >
            <defs>
              {centres.map((c, i) => (
                <clipPath key={i} id={`${clipId}-${i}`}>
                  <circle cx={c.x} cy={c.y} r={r} />
                </clipPath>
              ))}
            </defs>

            {/*
              The shared region: nesting one clip per circle intersects them all,
              so three sets tint only the true centre. Drawn UNDER the outlines
              so the strokes stay crisp.
            */}
            <g clipPath={`url(#${clipId}-0)`} opacity={tintP}>
              <g clipPath={`url(#${clipId}-1)`}>
                {three ? (
                  <g clipPath={`url(#${clipId}-2)`}>
                    <rect x={0} y={0} width={stageW} height={stageH} fill={theme.accent} opacity={0.22} />
                  </g>
                ) : (
                  <rect x={0} y={0} width={stageW} height={stageH} fill={theme.accent} opacity={0.22} />
                )}
              </g>
            </g>

            {/* Outlines — each circle draws itself in as its set is named. */}
            {centres.map((c, i) => {
              const p = easeOutQuint(clamp01((frame - circleAt - i * f30(fps, 4)) / f30(fps, 14)));
              if (p <= 0) return null;
              return (
                <circle
                  key={i}
                  cx={c.x}
                  cy={c.y}
                  r={r * (0.94 + 0.06 * p)}
                  fill="none"
                  stroke={hairline(theme, 0.55)}
                  strokeWidth={Math.max(2.5, 2.6 * u)}
                  opacity={p}
                />
              );
            })}
          </svg>

          {/*
            Set labels. Two circles put the label INSIDE its outer lobe (the
            classic reading); three push the label outside along the circle's
            outward direction, where there is room for it.
          */}
          {sets.map((s, i) => {
            const c = centres[i];
            const p = easeOutQuint(clamp01((frame - at[i]) / f30(fps, 10)));
            if (p <= 0) return null;

            const outward = three
              ? { x: c.x - cx, y: c.y - cy }
              : { x: c.x - cx, y: 0 };
            const len = Math.hypot(outward.x, outward.y) || 1;
            const lx = c.x + (outward.x / len) * outPush;
            const ly = c.y + (outward.y / len) * outPush;
            const boxW = r * (three ? 1.1 : 1.0);

            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: lx - boxW / 2,
                  top: ly - labelFs * 0.9,
                  width: boxW,
                  textAlign: 'center',
                  opacity: p,
                  transform: `translateY(${(1 - p) * 8 * u}px)`,
                }}
              >
                <div
                  style={{
                    fontFamily: BODY_FONT,
                    fontSize: labelFs,
                    fontWeight: 800,
                    color: theme.text,
                    lineHeight: 1.15,
                  }}
                >
                  {s.label.trim()}
                </div>
                {(s.caption ?? '').trim() ? (
                  <div
                    style={{
                      marginTop: 6 * u,
                      fontFamily: MONO_FONT,
                      fontSize: capFs,
                      color: theme.muted,
                      lineHeight: 1.2,
                    }}
                  >
                    {(s.caption ?? '').trim()}
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* The overlap label: the punchline, stamped into the shared middle. */}
          {overlapLabel ? (
            (() => {
              const pop = spring({
                frame: Math.max(0, frame - overlapAt),
                fps,
                config: SPRINGS.pop,
                durationInFrames: Math.round(fps * 0.45),
              });
              if (pop <= 0.001) return null;
              const boxW = r * (three ? 1.15 : 1.05);
              return (
                <div
                  style={{
                    ...surface,
                    position: 'absolute',
                    left: cx - boxW / 2,
                    top: (three ? cy + r * 0.12 : cy) - overlapFs * 1.05,
                    width: boxW,
                    padding: `${overlapFs * 0.36}px ${overlapFs * 0.3}px`,
                    boxSizing: 'border-box',
                    textAlign: 'center',
                    background: theme.accent,
                    color: inkOn(theme.accent),
                    fontFamily: BODY_FONT,
                    fontSize: overlapFs,
                    fontWeight: 800,
                    lineHeight: 1.15,
                    opacity: Math.min(1, pop),
                    transform: `scale(${Math.min(1.06, pop)})`,
                  }}
                >
                  {overlapLabel}
                </div>
              );
            })()
          ) : null}
        </div>

        {caption ? (
          <div
            style={{
              marginTop: 26 * u,
              fontFamily: MONO_FONT,
              fontSize: 23 * u,
              letterSpacing: 1.4 * u,
              color: theme.muted,
              opacity: headIn,
              textAlign: 'center',
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
