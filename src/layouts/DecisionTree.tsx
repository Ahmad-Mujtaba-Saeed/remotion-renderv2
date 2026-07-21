import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, DecisionBranch } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useSurfaceStyle } from '../components/Surface';
import { useScaleUnit } from '../responsive';
import { clamp01, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';

/** A node placed on the grid: a question to ask or an outcome to land on. */
interface Node {
  kind: 'question' | 'outcome';
  text: string;
  x: number;
  y: number;
  w: number;
  at: number;
}

/** A connector between two nodes, carrying the answer that takes it. */
interface Edge {
  from: { x: number; y: number };
  to: { x: number; y: number };
  label: string;
  at: number;
}

/**
 * decision_tree — the "which one should you use" beat.
 *
 * The opening question sits at the top, two labelled connectors sweep down to
 * the answers, and a path that needs one more question splits again into its
 * two outcomes. Outcomes land in accent because they are what the viewer came
 * for; questions stay on panel.
 *
 * LAYOUT IS SOLVED FROM THE LEAVES UP, which is what keeps it collision-free:
 * every ending gets its own column, each level-2 node is centred over the
 * columns it owns, and the root is centred over everything. A branch that ends
 * at level 1 keeps its box on the middle row rather than dropping to the
 * bottom — the path visibly finishes sooner, and it leaves the bottom row for
 * the endings that needed another question.
 *
 * The validator guarantees depth ≤ 2 and that both branches resolve, so there
 * is no case here where a node has nowhere to go. Flat law: hairline
 * connectors, panel/accent boxes, no shadow. Silent per §1.3.
 */
export const DecisionTree: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_decision'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const surface = useSurfaceStyle(false);
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;

  const question = (slot.question ?? '').trim();
  const branches: DecisionBranch[] = (slot.branches ?? []).slice(0, 2);
  if (question === '' || branches.length !== 2) return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 10)));

  // ---- Columns: one per ending ---------------------------------------------
  const spans = branches.map((b) => (b.branches && b.branches.length === 2 ? 2 : 1));
  const cols = spans[0] + spans[1];

  const stageW = width * (portrait ? 0.94 : 0.82);
  const stageH = height * (portrait ? 0.5 : 0.56);
  const colW = stageW / cols;
  const gap = colW * 0.1;
  const boxW = colW - gap;

  const rootFs = (portrait ? 27 : 30) * u;
  const nodeFs = (portrait ? 22 : 25) * u;
  const edgeFs = (portrait ? 18 : 20) * u;

  /*
   * Rows are measured from the TOP EDGE of the root box, not its centre —
   * anchoring the root at y=0 pushed half of it above the stage and straight
   * through the heading (the probe still showed it striking "Which
   * transport?"). Every node is positioned by its centre, so the root's centre
   * has to start one half-height down.
   */
  const rootHalf = rootFs * 1.5;
  const rootY = rootHalf;
  const midY = rootY + (stageH - rootY) * 0.42;
  const leafY = rootY + (stageH - rootY) * 0.86;

  const rootW = Math.min(stageW * 0.72, boxW * 2.2);
  const rootX = stageW / 2;

  /** Keep a box inside the stage — a wide level-1 outcome ran off the edge. */
  const fitX = (x: number, w: number) => Math.min(Math.max(x, w / 2), stageW - w / 2);

  // ---- Build the graph ------------------------------------------------------
  const nodes: Node[] = [{ kind: 'question', text: question, x: rootX, y: rootY, w: rootW, at: f30(fps, 4) }];
  const edges: Edge[] = [];

  let col = 0;
  branches.forEach((branch, i) => {
    const span = spans[i];
    // Centre of the columns this branch owns.
    const cx = (col + span / 2) * colW;
    const branchAt = f30(fps, 16) + i * f30(fps, 9);

    if (branch.branches && branch.branches.length === 2) {
      const subQ = (branch.question ?? '').trim();
      const subW = Math.min(boxW * 1.7, stageW * 0.46);
      const sx = fitX(cx, subW);
      nodes.push({ kind: 'question', text: subQ, x: sx, y: midY, w: subW, at: branchAt });
      edges.push({ from: { x: rootX, y: rootY }, to: { x: sx, y: midY }, label: (branch.label ?? '').trim(), at: branchAt });

      branch.branches.slice(0, 2).forEach((leaf, j) => {
        const lx = fitX((col + j + 0.5) * colW, boxW);
        const leafAt = branchAt + f30(fps, 10) + j * f30(fps, 6);
        nodes.push({ kind: 'outcome', text: (leaf.outcome ?? '').trim(), x: lx, y: leafY, w: boxW, at: leafAt });
        edges.push({ from: { x: sx, y: midY }, to: { x: lx, y: leafY }, label: (leaf.label ?? '').trim(), at: leafAt });
      });
    } else {
      // Ends at level 1: the box stays on the middle row, so the path visibly
      // finishes sooner than one that needed another question.
      const leafW = Math.min(boxW * 1.5, stageW * 0.4);
      const lx = fitX(cx, leafW);
      nodes.push({ kind: 'outcome', text: (branch.outcome ?? '').trim(), x: lx, y: midY, w: leafW, at: branchAt });
      edges.push({ from: { x: rootX, y: rootY }, to: { x: lx, y: midY }, label: (branch.label ?? '').trim(), at: branchAt });
    }
    col += span;
  });

  /** Half-height of a box, used to start/end connectors at its edge. */
  const halfH = (n: { kind: string; w: number }) => (n.kind === 'question' ? nodeFs * 1.5 : nodeFs * 1.4);

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
                  fontSize: (portrait ? 42 : 48) * u,
                  lineHeight: 1.06,
                  color: theme.text,
                }}
              >
                {heading}
              </h1>
            ) : null}
          </div>
        )}

        <div style={{ position: 'relative', width: stageW, height: stageH }}>
          {/* Connectors, drawn under the boxes. */}
          <svg
            width={stageW}
            height={stageH}
            viewBox={`0 0 ${stageW} ${stageH}`}
            style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
          >
            {edges.map((e, i) => {
              const p = easeOutQuint(clamp01((frame - e.at + f30(fps, 8)) / f30(fps, 12)));
              if (p <= 0) return null;
              const y1 = e.from.y + nodeFs * 1.5;
              const y2 = e.to.y - nodeFs * 1.4;
              const midYY = y1 + (y2 - y1) * 0.5;
              // Elbow: down, across, down — a flowchart line, not a diagonal.
              const d = `M ${e.from.x} ${y1} L ${e.from.x} ${midYY} L ${e.to.x} ${midYY} L ${e.to.x} ${y2}`;
              return (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={hairline(theme, 0.5)}
                  strokeWidth={Math.max(2, 2.2 * u)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={1000}
                  strokeDashoffset={1000 * (1 - p)}
                />
              );
            })}
          </svg>

          {/* Answer chips sit on the horizontal run of their connector. */}
          {edges.map((e, i) => {
            const p = easeOutQuint(clamp01((frame - e.at - f30(fps, 2)) / f30(fps, 10)));
            if (p <= 0 || e.label === '') return null;
            const y1 = e.from.y + nodeFs * 1.5;
            const y2 = e.to.y - nodeFs * 1.4;
            const cy = y1 + (y2 - y1) * 0.5;
            return (
              <div
                key={i}
                style={{
                  // Auto-width and centred on the connector's horizontal run:
                  // a fixed-width chip left stray stubs of line poking out
                  // either side of the label.
                  position: 'absolute',
                  left: (e.from.x + e.to.x) / 2,
                  top: cy - edgeFs * 0.95,
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  fontFamily: MONO_FONT,
                  fontSize: edgeFs,
                  fontWeight: 700,
                  letterSpacing: 1.4 * u,
                  textTransform: 'uppercase',
                  color: theme.accent,
                  background: theme.bg_to ?? theme.bg_from ?? 'transparent',
                  padding: `${edgeFs * 0.12}px ${edgeFs * 0.5}px`,
                  opacity: p,
                }}
              >
                {e.label}
              </div>
            );
          })}

          {/* Nodes. */}
          {nodes.map((n, i) => {
            const pop = spring({
              frame: Math.max(0, frame - n.at),
              fps,
              config: SPRINGS.pop,
              durationInFrames: Math.round(fps * 0.4),
            });
            if (pop <= 0.001 || n.text === '') return null;
            const isOutcome = n.kind === 'outcome';
            const fs = i === 0 ? rootFs : nodeFs;
            return (
              <div
                key={i}
                style={{
                  ...surface,
                  position: 'absolute',
                  left: n.x - n.w / 2,
                  top: n.y - halfH(n),
                  width: n.w,
                  minHeight: halfH(n) * 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: `${fs * 0.42}px ${fs * 0.5}px`,
                  boxSizing: 'border-box',
                  background: isOutcome ? theme.accent : theme.panel,
                  color: isOutcome ? inkOn(theme.accent) : theme.text,
                  fontFamily: BODY_FONT,
                  fontSize: fs,
                  fontWeight: isOutcome ? 800 : 700,
                  lineHeight: 1.22,
                  opacity: Math.min(1, pop),
                  transform: `scale(${Math.min(1.03, 0.97 + pop * 0.06)})`,
                }}
              >
                {n.text}
              </div>
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
