import React from 'react';
import { useVideoConfig } from 'remotion';
import { MotifShape, Slot } from '../types';
import { useTheme, useSkin, BODY_FONT, MONO_FONT, isLightTheme } from '../theme';
import { useScaleUnit } from '../responsive';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from './SceneMeta';
import { useMotionStyle } from '../motion/styles';
import { clamp01, easeOutCubic, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { spokenAt } from '../motion/narrationBeats';
import { sustainAt, sustainTransform } from '../motion/sustain';
import { LUCIDE_ICONS } from '../icons/lucide';

/**
 * vector_motif — the drawing of the thing the beat is about.
 *
 * Every other card renders a fixed shape with the scene's words poured into
 * it. This one renders a shape the planner CHOSE for this beat: a bottle
 * melting into a jar, a packet hopping between routers, a seed becoming a
 * tree. It is the answer to the complaint that a `stat_spotlight` looks the
 * same whatever the statistic is.
 *
 * Three things this component owns, because the payload is not allowed to:
 *
 * **The frame.** The shapes are authored in a fixed 100x100 logical view, and
 * this measures their real bounding box and fits THAT to the stage. A drawing
 * that came back off-centre, or occupying a third of its view, still lands
 * correctly filling the frame — composition is not something a model should
 * have to get right, and it is trivial to compute.
 *
 * **The palette.** Shapes name colours semantically (`accent` / `ink` /
 * `muted` / `paper`), never literally, so a motif is in the video's scheme for
 * free and cannot express a gradient or a glow. The flat law holds by
 * construction rather than by review.
 *
 * **The timing.** A shape carries `at` (a 0..1 point in the scene) or `word`
 * (land when the narrator says it) — the same cue contract `custom_card`
 * proved — and this resolves them against the scene clock and the narration.
 * Shapes with neither are staggered in document order, so a motif that came
 * back with no cues at all still builds up rather than appearing at once.
 * `life` then hands a settled shape one of iter 61's sustained loops.
 *
 * Everything here is transform / opacity / stroke-dashoffset, so it is camera
 * -world safe (§1.2) and flat-law safe (§1.1).
 */

/** Padding around the drawing's bounding box, as a fraction of its size. */
const PAD = 0.08;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The bounding box of one shape, in view units. Labels count their ink. */
const shapeBox = (s: MotifShape): Box => {
  switch (s.kind) {
    case 'circle': {
      const cx = s.cx ?? 50;
      const cy = s.cy ?? 50;
      const r = s.r ?? 10;
      return { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r };
    }
    case 'rect': {
      const x = s.x ?? 25;
      const y = s.y ?? 25;
      return { x0: x, y0: y, x1: x + (s.w ?? 50), y1: y + (s.h ?? 30) };
    }
    case 'line':
    case 'arrow': {
      const x1 = s.x1 ?? 0;
      const y1 = s.y1 ?? 0;
      const x2 = s.x2 ?? 0;
      const y2 = s.y2 ?? 0;
      return { x0: Math.min(x1, x2), y0: Math.min(y1, y2), x1: Math.max(x1, x2), y1: Math.max(y1, y2) };
    }
    case 'icon': {
      const x = s.x ?? 50;
      const y = s.y ?? 50;
      const h = (s.size ?? 20) / 2;
      return { x0: x - h, y0: y - h, x1: x + h, y1: y + h };
    }
    case 'label': {
      const x = s.x ?? 50;
      const y = s.y ?? 50;
      const size = s.size ?? 6;
      // A rough advance width; the fit only needs to be close, and over-
      // estimating a label is safer than clipping it.
      const w = (s.text ?? '').length * size * 0.52;
      const half = s.anchor === 'start' ? 0 : s.anchor === 'end' ? w : w / 2;
      return { x0: x - half, y0: y - size, x1: x - half + w, y1: y + size * 0.35 };
    }
    case 'path':
    default:
      // A path's true extent needs the parser this deliberately does not have.
      // Claiming the whole view is the safe answer: the fit can only ever be
      // too generous, never too tight.
      return { x0: 0, y0: 0, x1: 100, y1: 100 };
  }
};

const unionBox = (shapes: MotifShape[]): Box =>
  shapes.reduce<Box>(
    (acc, s) => {
      const b = shapeBox(s);
      return {
        x0: Math.min(acc.x0, b.x0),
        y0: Math.min(acc.y0, b.y0),
        x1: Math.max(acc.x1, b.x1),
        y1: Math.max(acc.y1, b.y1),
      };
    },
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  );

/** The path an arrow head draws at the end of a segment, in view units. */
const arrowHead = (s: MotifShape): string => {
  const x1 = s.x1 ?? 0;
  const y1 = s.y1 ?? 0;
  const x2 = s.x2 ?? 0;
  const y2 = s.y2 ?? 0;
  const a = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.max(2.5, Math.min(6, Math.hypot(x2 - x1, y2 - y1) * 0.18));
  const spread = 0.42;
  const px = (t: number) => x2 - len * Math.cos(a + t);
  const py = (t: number) => y2 - len * Math.sin(a + t);
  return `M ${px(spread)} ${py(spread)} L ${x2} ${y2} L ${px(-spread)} ${py(-spread)}`;
};

export const VectorMotif: React.FC<{ slot: Slot }> = ({ slot }) => {
  const theme = useTheme();
  const skin = useSkin();
  const u = useScaleUnit();
  const { fps } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();
  const meta = useSceneMeta();
  const motion = useMotionStyle();

  const shapes = slot.shapes ?? [];
  if (!shapes.length) {
    return <div style={{ width: '100%', height: '100%' }} />;
  }

  // ---- Palette -------------------------------------------------------------
  // `paper` is the scene's own field, which is what makes a knock-out possible:
  // a filled shape in paper reads as a hole in the drawing rather than as
  // white, on any scheme.
  const ink = (name: MotifShape['stroke']): string | undefined => {
    switch (name) {
      case 'accent':
        return theme.accent;
      case 'ink':
        return theme.text;
      case 'muted':
        return theme.muted;
      case 'paper':
        return theme.bg_from ?? (isLightTheme(theme) ? '#ffffff' : '#0f172a');
      default:
        return undefined;
    }
  };

  // ---- Fit -----------------------------------------------------------------
  const box = unionBox(shapes);
  const bw = Math.max(1, box.x1 - box.x0);
  const bh = Math.max(1, box.y1 - box.y0);
  const pad = Math.max(bw, bh) * PAD;
  const viewBox = `${box.x0 - pad} ${box.y0 - pad} ${bw + pad * 2} ${bh + pad * 2}`;

  // ---- Timing --------------------------------------------------------------
  // The drawing builds over the first ~70% of the scene: the last stretch is
  // for looking at what is there (§2.6's breathing-room rule).
  const first = f30(fps, Math.round(motion.baseF * 0.6));
  const span = Math.max(1, durationInFrames * 0.7 - first);
  const dur = f30(fps, motion.baseF + 6);
  const drawn = shapes.filter((s) => s.kind !== 'label').length || 1;

  const landing = (s: MotifShape, i: number): number => {
    // A spoken cue is the most precise thing available and outranks a
    // fraction; a shape with neither takes its turn in document order.
    const spoken = s.word ? spokenAt(meta.words ?? undefined, s.word, fps) : null;
    if (spoken !== null) return spoken;
    if (s.at !== undefined) return Math.round(first + s.at * span);
    return Math.round(first + (i / Math.max(1, drawn)) * span * 0.8);
  };

  // A plain sized box, NOT an AbsoluteFill: this component is a SLOT, and a
  // slot may be half a split. An absolutely-positioned fill resolves against
  // the nearest positioned ancestor, which is the frame — the first probe had
  // the drawing centred on the whole video, straddling the text beside it.
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '6%',
        boxSizing: 'border-box',
        flexDirection: 'column',
        gap: 24 * u,
        overflow: 'hidden',
      }}
    >
      <svg
        viewBox={viewBox}
        style={{ width: '100%', height: slot.caption ? '86%' : '100%', overflow: 'visible' }}
        preserveAspectRatio="xMidYMid meet"
        fill="none"
      >
        {shapes.map((s, i) => {
          const at = landing(s, i);
          const local = frame - at;
          const p = easeOutQuint(clamp01(local / dur));
          if (p <= 0) return null;

          const stroke = ink(s.stroke);
          const fill = ink(s.fill);
          // The whole drawing is authored at a 100-unit scale, so a stroke
          // width is in those units too — it scales with the fit, which is
          // what keeps a motif looking the same weight in 16:9 and 9:16.
          const common = {
            stroke,
            fill,
            strokeWidth: s.width,
            strokeLinecap: 'round' as const,
            strokeLinejoin: 'round' as const,
          };

          // ---- Entrance ---------------------------------------------------
          // `draw` is the only one that is not a transform: it rides
          // stroke-dashoffset, which is the flat-law-blessed way to make a
          // line appear (§1.1) and the reason strokes default to it.
          const drawP = s.anim === 'draw' ? p : 1;
          let opacity = s.opacity;
          const transforms: string[] = [];
          const b = shapeBox(s);
          const ox = (b.x0 + b.x1) / 2;
          const oy = (b.y0 + b.y1) / 2;

          if (s.anim === 'pop') {
            transforms.push(`translate(${ox} ${oy})`, `scale(${0.86 + 0.14 * p})`, `translate(${-ox} ${-oy})`);
            opacity *= easeOutCubic(clamp01(local / (dur * 0.6)));
          } else if (s.anim === 'rise') {
            transforms.push(`translate(0 ${(1 - p) * 8})`);
            opacity *= easeOutCubic(clamp01(local / (dur * 0.7)));
          } else if (s.anim === 'fade') {
            opacity *= easeOutCubic(clamp01(local / dur));
          } else if (s.anim === 'draw') {
            // A drawn stroke is fully opaque from the first frame; the line
            // growing IS the entrance, and fading it in as well reads as a
            // mistake.
            opacity *= 1;
          }

          // ---- Sustained loop (iter 61) -------------------------------------
          // Faded in by the entrance so the loop never fights the arrival, and
          // applied around the shape's own centre so a `breathe` scales in
          // place instead of drifting toward the origin.
          if (s.life) {
            const life = sustainAt(frame / fps, { kind: s.life, seed: i + 1, amp: p });
            // The loop's px lengths are a 1080 basis; the view is 100 units
            // across, so they are re-expressed in view units before use.
            const inView = { ...life, dx: life.dx * 0.09, dy: life.dy * 0.09 };
            const t = sustainTransform(inView);
            if (t) {
              transforms.push(`translate(${ox} ${oy})`, t, `translate(${-ox} ${-oy})`);
            }
          }

          const transform = transforms.length ? transforms.join(' ') : undefined;
          const g = { key: s.id, transform, opacity };

          // pathLength normalises every shape to one unit of length, so a
          // single dashoffset draws a 4-unit line and a 90-unit path at the
          // same pace.
          const dash =
            s.anim === 'draw'
              ? { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - drawP }
              : {};

          switch (s.kind) {
            case 'circle':
              return (
                <g {...g}>
                  <circle cx={s.cx} cy={s.cy} r={s.r} {...common} {...dash} />
                </g>
              );
            case 'rect':
              return (
                <g {...g}>
                  <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.round} {...common} {...dash} />
                </g>
              );
            case 'line':
              return (
                <g {...g}>
                  <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} {...common} fill="none" {...dash} />
                </g>
              );
            case 'arrow':
              return (
                <g {...g}>
                  <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} {...common} fill="none" {...dash} />
                  {/* The head only appears once the shaft has arrived — an
                      arrowhead floating ahead of its own line reads as a bug. */}
                  <path
                    d={arrowHead(s)}
                    {...common}
                    fill="none"
                    opacity={easeOutCubic(clamp01((drawP - 0.75) / 0.25))}
                  />
                </g>
              );
            case 'path':
              return (
                <g {...g}>
                  <path d={s.d} {...common} {...dash} />
                </g>
              );
            case 'icon': {
              const size = s.size ?? 20;
              const nodes = LUCIDE_ICONS[s.name ?? ''];
              if (!nodes) return null;
              const k = size / 24;
              return (
                <g {...g}>
                  <g
                    transform={`translate(${(s.x ?? 50) - size / 2} ${(s.y ?? 50) - size / 2}) scale(${k})`}
                    stroke={stroke ?? theme.text}
                    strokeWidth={(s.width * 1.6) / k}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  >
                    {nodes.map(([tag, attrs], n) =>
                      React.createElement(tag, {
                        key: n,
                        ...attrs,
                        pathLength: 1,
                        strokeDasharray: 1,
                        strokeDashoffset: 1 - drawP,
                      })
                    )}
                  </g>
                </g>
              );
            }
            case 'label':
              return (
                <g {...g}>
                  <text
                    x={s.x}
                    y={s.y}
                    textAnchor={s.anchor}
                    fill={fill ?? theme.text}
                    stroke="none"
                    style={{
                      fontFamily: skin === 'blueprint' ? MONO_FONT : BODY_FONT,
                      fontSize: s.size,
                      fontWeight: 700,
                    }}
                  >
                    {s.text}
                  </text>
                </g>
              );
            default:
              return null;
          }
        })}
      </svg>

      {slot.caption ? (
        <div
          style={{
            fontFamily: MONO_FONT,
            fontSize: 22 * u,
            letterSpacing: 2 * u,
            textTransform: 'uppercase',
            color: theme.muted,
            textAlign: 'center',
            opacity: easeOutCubic(clamp01((frame - first - f30(fps, 8)) / f30(fps, 12))),
          }}
        >
          {slot.caption}
        </div>
      ) : null}
    </div>
  );
};
