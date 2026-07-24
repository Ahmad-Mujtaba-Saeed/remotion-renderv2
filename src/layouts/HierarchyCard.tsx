import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, HierarchyChild } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText, fitGroup } from '../typography';
import { clamp01 } from '../motion/easing';
import { f30, idleScale } from '../motion/choreo';
import { useCardReveal } from '../motion/cardReveal';
import { edgePath, pointAlong } from '../motion/draw';
import { calloutRevealSchedule } from '../components/CalloutLayer';

/**
 * hierarchy_card — "how is X structured", drawn as what it is: an org chart.
 *
 * The root sits at the top, connectors sweep down to a row of 2-4 branches, and
 * any branch that has sub-parts drops a short spine to its own stacked
 * children. Each branch lands as the narration names it (word-synced via
 * calloutRevealSchedule), its grandchildren following, and the branch this beat
 * is about takes the accent.
 *
 * LAYOUT IS FULLY COMPUTED FROM THE COUNTS — one column per branch, the root
 * centred over them, the grandchild area budgeted from whatever height is left
 * after the heading zone and the branch row (the label-zone class of bug:
 * cycle iter 7, venn 17, decision 20). No measure pass, so it is deterministic
 * at any aspect. Flat law: hairline connectors, panel/accent boxes, no shadow.
 * Silent per §1.3.
 */
export const HierarchyCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_hierarchy'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();
  const reveal = useCardReveal();

  if (!slot) return null;

  const root = (slot.root ?? '').trim();
  const children: HierarchyChild[] = (slot.children ?? [])
    .filter((c) => c && (c.label ?? '').trim() !== '')
    .slice(0, 4);
  // Guaranteed by the validator; a defensive gate keeps a hand-edited
  // storyboard from rendering an empty tree.
  if (root === '' || children.length < 2) return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const headIn = reveal.ease(clamp01(frame / reveal.headFrames));

  const highlight =
    typeof slot.highlight_index === 'number' && children[slot.highlight_index] !== undefined
      ? slot.highlight_index
      : null;

  // ---- Heading zone, budgeted first ----------------------------------------
  const headFs = heading
    ? fitText(heading, {
        width: width * (portrait ? 0.86 : 0.74),
        max: (portrait ? 46 : 52) * u,
        min: 26 * u,
        maxLines: 2,
        font: displayFont,
        weight: 900,
      })
    : 0;
  const headZone = (kicker ? 38 * u : 0) + (heading ? headFs * 1.15 : 0) + (kicker || heading ? 26 * u : 0);
  const capZone = caption ? 46 * u : 0;

  // ---- Columns: one per branch ---------------------------------------------
  const cols = children.length;
  const stageW = width * (portrait ? 0.96 : 0.86);
  const stageH = height * (portrait ? 0.66 : 0.7) - headZone - capZone;
  const colW = stageW / cols;
  const colGap = colW * 0.08;
  const childBoxW = colW - colGap;

  const allGc = children.flatMap((c) => (c.children ?? []).map((g) => (g.label ?? '').trim()).filter(Boolean));
  const maxGc = Math.max(0, ...children.map((c) => (c.children ?? []).filter((g) => (g.label ?? '').trim() !== '').length));
  const childHasCaption = children.some((c) => (c.caption ?? '').trim() !== '');

  // ---- Type sizes, each a single group size (iter 24) ----------------------
  const rootFs = fitText(root, {
    width: Math.min(stageW * 0.72, childBoxW * 2.4),
    max: (portrait ? 32 : 36) * u,
    min: 20 * u,
    maxLines: 2,
    font: displayFont,
    weight: 800,
  });
  const childFs = fitGroup(
    children.map((c) => c.label.trim()),
    { width: childBoxW * 0.84, max: (portrait ? 24 : 27) * u, min: 14 * u, maxLines: 2, font: BODY_FONT, weight: 700, kinetic: false }
  );
  const childCapFs = Math.max(13 * u, childFs * 0.62);

  // ---- Vertical geometry ---------------------------------------------------
  const rootHalfH = rootFs * 1.35;
  const rootY = rootHalfH;
  const childBoxH = childFs * 1.2 * 2 + (childHasCaption ? childCapFs * 1.5 : 0) + childFs * 0.9;
  const childHalfH = childBoxH / 2;
  const levelGap = (portrait ? 44 : 54) * u;
  const childY = rootY + rootHalfH + levelGap + childHalfH;

  // The grandchild rows take whatever is left below the branch row, divided by
  // the DEEPEST column so a 4-deep column and a bare one share one baseline.
  const gcSpineGap = (portrait ? 22 : 26) * u;
  const gcAreaTop = childY + childHalfH + gcSpineGap;
  const gcAreaAvail = Math.max(0, stageH - gcAreaTop);
  const gcRowGap = 9 * u;
  const gcChipH = maxGc > 0 ? Math.max(26 * u, Math.min(48 * u, gcAreaAvail / maxGc - gcRowGap)) : 0;
  const grandFs = allGc.length
    ? fitGroup(allGc, {
        width: childBoxW * 0.8,
        max: Math.min(20 * u, gcChipH * 0.44),
        min: 11 * u,
        maxLines: 1,
        font: BODY_FONT,
        weight: 600,
        kinetic: false,
      })
    : 0;

  const colCenterX = (i: number) => (i + 0.5) * colW;
  const rootX = stageW / 2;
  const rootW = Math.min(stageW * 0.72, childBoxW * 2.4);

  // The container is sized to the ACTUAL content extent, not the full vertical
  // budget — otherwise a tree with no grandchildren reserves the whole
  // grandchild area and centres with a large empty band beneath it. The budget
  // (stageH) still sizes gcChipH; contentH is what the frame centres on.
  const gcStackH = maxGc > 0 ? gcSpineGap + maxGc * gcChipH + (maxGc - 1) * gcRowGap : 0;
  const contentH = childY + childHalfH + gcStackH;

  // ---- Reveal schedule -----------------------------------------------------
  const rootAt = f30(fps, 3);
  const childAt = calloutRevealSchedule(
    children.map((c) => c.label.trim()),
    scene.narration_words,
    fps,
    { first: reveal.first, step: reveal.step }
  );
  const gcAt = (i: number, j: number) => childAt[i] + f30(fps, 8) + j * f30(fps, 4);

  // ---- Edges (drawn under the boxes) ---------------------------------------
  // Each edge carries its polyline POINTS, not just an SVG string, so a write
  // cursor (the "nib") can ride the exact draw frontier as the line grows.
  interface Edge {
    pts: [number, number][];
    at: number;
  }
  const edges: Edge[] = [];
  children.forEach((child, i) => {
    const cx = colCenterX(i);
    // Root -> branch: elbow (down, across, down), a flowchart line.
    const y1 = rootY + rootHalfH;
    const y2 = childY - childHalfH;
    const midY = y1 + (y2 - y1) * 0.5;
    edges.push({
      pts: [[rootX, y1], [rootX, midY], [cx, midY], [cx, y2]],
      at: childAt[i] - f30(fps, 6),
    });
    // Branch -> its grandchildren: a straight vertical spine segment per gap.
    const gc = (child.children ?? []).filter((g) => (g.label ?? '').trim() !== '').slice(0, 4);
    let prevBottom = childY + childHalfH;
    gc.forEach((_g, j) => {
      const gy = gcAreaTop + gcChipH / 2 + j * (gcChipH + gcRowGap);
      edges.push({ pts: [[cx, prevBottom], [cx, gy - gcChipH / 2]], at: gcAt(i, j) - f30(fps, 4) });
      prevBottom = gy + gcChipH / 2;
    });
  });

  const nodeSpring = (at: number) =>
    spring({ frame: Math.max(0, frame - at), fps, config: reveal.config, durationInFrames: reveal.popFrames });
  // The landing kicker rides the style's overshoot — bounce visibly catches,
  // elegant/swiss settle flat. The `hero` node also takes a ±0.3% idle breath
  // AFTER it settles (Law 6: exactly one element per scene is never frozen),
  // so a card that lands early never holds a dead frame. The idle is
  // imperceptible during the pop and only reads once the frame is otherwise
  // still.
  const nodeScale = (pop: number, hero = false) =>
    Math.min(1.03 + reveal.overshoot, 0.96 + pop * (0.07 + reveal.overshoot * 1.5)) *
    (hero ? idleScale(frame, fps) : 1);
  // The hero is the highlighted branch, or the root when nothing is highlighted.
  const heroIsRoot = highlight === null;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '4%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {(kicker || heading) && (
          <div style={{ textAlign: 'center', marginBottom: 22 * u, opacity: headIn }}>
            {kicker ? (
              <div
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 23 * u,
                  letterSpacing: 4 * u,
                  textTransform: 'uppercase',
                  color: theme.accent,
                  marginBottom: heading ? 10 * u : 0,
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
                  fontSize: headFs,
                  lineHeight: 1.06,
                  color: theme.text,
                }}
              >
                {heading}
              </h1>
            ) : null}
          </div>
        )}

        <div style={{ position: 'relative', width: stageW, height: contentH }}>
          {/* Connectors, under the boxes. */}
          <svg
            width={stageW}
            height={contentH}
            viewBox={`0 0 ${stageW} ${contentH}`}
            style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
          >
            {edges.map((e, i) => {
              const p = reveal.ease(clamp01((frame - e.at) / f30(fps, 12)));
              if (p <= 0) return null;
              return (
                <path
                  key={i}
                  d={edgePath(e.pts)}
                  fill="none"
                  stroke={hairline(theme, 0.5)}
                  strokeWidth={Math.max(2, 2.2 * u)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={1400}
                  strokeDashoffset={1400 * (1 - p)}
                />
              );
            })}
            {/* The nib: a small accent dot riding the draw frontier while a
                connector grows, gone the instant it lands. It is the pen tip
                the eye follows as the chart writes itself. */}
            {edges.map((e, i) => {
              const p = reveal.ease(clamp01((frame - e.at) / f30(fps, 12)));
              if (p <= 0.02 || p >= 0.98) return null;
              const [nx, ny] = pointAlong(e.pts, p);
              return <circle key={`nib-${i}`} cx={nx} cy={ny} r={Math.max(3, 3.4 * u)} fill={theme.accent} />;
            })}
          </svg>

          {/* Root. */}
          {(() => {
            const pop = nodeSpring(rootAt);
            if (pop <= 0.001) return null;
            return (
              <div
                style={{
                  position: 'absolute',
                  left: rootX - rootW / 2,
                  top: rootY - rootHalfH,
                  width: rootW,
                  minHeight: rootHalfH * 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: `${rootFs * 0.4}px ${rootFs * 0.6}px`,
                  boxSizing: 'border-box',
                  background: theme.panel,
                  border: `${Math.max(2, 2.4 * u)}px solid ${theme.text}`,
                  color: theme.text,
                  fontFamily: displayFont,
                  fontWeight: 800,
                  fontSize: rootFs,
                  lineHeight: 1.12,
                  opacity: Math.min(1, pop),
                  transform: `scale(${nodeScale(pop, heroIsRoot)})`,
                }}
              >
                {root}
              </div>
            );
          })()}

          {/* Branches and their grandchildren. */}
          {children.map((child, i) => {
            const cx = colCenterX(i);
            const isStar = i === highlight;
            const pop = nodeSpring(childAt[i]);
            const cap = (child.caption ?? '').trim();
            const gc = (child.children ?? []).filter((g) => (g.label ?? '').trim() !== '').slice(0, 4);
            return (
              <React.Fragment key={i}>
                {pop > 0.001 ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: cx - childBoxW / 2,
                      top: childY - childHalfH,
                      width: childBoxW,
                      minHeight: childBoxH,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      padding: `${childFs * 0.5}px ${childFs * 0.4}px`,
                      boxSizing: 'border-box',
                      background: isStar ? theme.accent : theme.panel,
                      border: `1px solid ${hairline(theme, isStar ? 0.34 : 0.18)}`,
                      color: isStar ? inkOn(theme.accent) : theme.text,
                      fontFamily: BODY_FONT,
                      fontWeight: 700,
                      fontSize: childFs,
                      lineHeight: 1.18,
                      opacity: Math.min(1, pop),
                      transform: `scale(${nodeScale(pop, i === highlight)})`,
                    }}
                  >
                    <div>{child.label.trim()}</div>
                    {cap !== '' ? (
                      <div
                        style={{
                          marginTop: 4 * u,
                          fontFamily: BODY_FONT,
                          fontSize: childCapFs,
                          fontWeight: 500,
                          color: isStar ? inkOn(theme.accent) : theme.muted,
                          lineHeight: 1.2,
                        }}
                      >
                        {cap}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {gc.map((g, j) => {
                  const gp = nodeSpring(gcAt(i, j));
                  if (gp <= 0.001) return null;
                  const gy = gcAreaTop + gcChipH / 2 + j * (gcChipH + gcRowGap);
                  return (
                    <div
                      key={`gc-${i}-${j}`}
                      style={{
                        position: 'absolute',
                        left: cx - childBoxW / 2,
                        top: gy - gcChipH / 2,
                        width: childBoxW,
                        height: gcChipH,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        padding: `0 ${childBoxW * 0.06}px`,
                        boxSizing: 'border-box',
                        background: theme.bg_to ?? theme.bg_from ?? 'transparent',
                        border: `1px solid ${hairline(theme, 0.16)}`,
                        color: theme.text,
                        fontFamily: BODY_FONT,
                        fontWeight: 600,
                        fontSize: grandFs,
                        lineHeight: 1.15,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        opacity: Math.min(1, gp),
                        transform: `translateY(${(1 - Math.min(1, gp)) * -8 * u}px)`,
                      }}
                    >
                      {g.label.trim()}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>

        {caption ? (
          <div
            style={{
              marginTop: 20 * u,
              fontFamily: MONO_FONT,
              fontSize: 22 * u,
              letterSpacing: 1.2 * u,
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
