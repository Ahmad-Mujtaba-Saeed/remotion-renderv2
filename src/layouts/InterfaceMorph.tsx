import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene, InterfaceState, InterfaceKind } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01, easeOutCubic } from '../motion/easing';

const easeInOutCubic = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
import { beatFrames } from '../motion/narrationBeats';
import { useMotionBlurOn } from '../motion/ghost';
import { useDepth } from '../motion/depthStage';
import { KineticText } from '../components/KineticText';
import { useEdit } from '../components/Editable';
import { SPR, track, liquidEdges, swapVis, springStep, TrackKey } from '../motion/springTrack';
import { Cursor } from '../components/Cursor';

/**
 * interface_morph — ONE shape that never cuts.
 *
 * The idea is lifted from the motion-broll skill (Barty-Bart/motion-graphics,
 * MIT): a single surface morphs its size and corners from state to state — a
 * button, a search field, a toggle, a slider, tabs, a checklist, a progress
 * bar, a terminal — while its content swaps with a short soft cut, and a
 * mouse cursor DRIVES every change with a real click, drag or keystroke that
 * lands on the narrator's word. It is the card for "you do X, then Y
 * happens": pressing, searching, switching on, turning up, choosing, ticking
 * off, waiting, typing.
 *
 * Everything is a pure function of the scene clock (springs are closed-form
 * sums, see motion/springTrack), so any frame renders on its own. States are
 * a VOCABULARY, never free markup: the planner picks kinds and writes short
 * labels; geometry, timing and the cursor's path are derived here.
 *
 * Honesty rule from the skill: numbers are never invented. A slider or bar
 * shows position, not a figure, unless the planner supplied a value.
 */

type Size = { w: number; h: number; r: number; dark?: boolean };

const KINDS: InterfaceKind[] = ['button', 'search', 'toggle', 'slider', 'tabs', 'checklist', 'progress', 'terminal', 'card', 'toast'];

/** The shape each state asks for, in design px at 1080p. */
const sizeOf = (st: InterfaceState): Size => {
  const n = Math.min(4, st.items?.length ?? 0);
  switch (st.kind) {
    case 'button':
      return { w: Math.max(440, Math.min(760, 150 + (st.text ?? '').length * 26)), h: 140, r: 70 };
    case 'search':
      return { w: 980, h: 136 + n * 88 + (n ? 20 : 0), r: 40 };
    case 'toggle':
      return { w: 760, h: 190, r: 95 };
    case 'slider':
      return { w: 980, h: 290, r: 46 };
    case 'tabs':
      return { w: Math.min(1100, 60 + Math.max(2, n) * 250), h: 150, r: 75 };
    case 'checklist':
      return { w: 860, h: 150 + n * 96, r: 40 };
    case 'progress':
      return { w: 980, h: 250, r: 46 };
    case 'terminal':
      return { w: 1100, h: 130 + Math.max(1, n) * 64, r: 28, dark: true };
    case 'card':
      return { w: 860, h: 190 + n * 66, r: 40 };
    case 'toast':
    default:
      return { w: Math.max(560, Math.min(900, 220 + (st.text ?? '').length * 22)), h: 150, r: 75 };
  }
};

/** Where the cursor acts on a state, in shape-local px (origin = centre). */
const targetOf = (st: InterfaceState, sz: Size): { x: number; y: number } | null => {
  const n = Math.max(2, Math.min(4, st.items?.length ?? 2));
  switch (st.kind) {
    case 'button':
      return { x: sz.w * 0.18, y: 10 };
    case 'search':
      return { x: -sz.w / 2 + 260, y: -sz.h / 2 + 68 };
    case 'toggle':
      return { x: sz.w / 2 - 130, y: 6 };
    case 'slider':
      return { x: -sz.w / 2 + 70 + (sz.w - 140) * 0.08, y: 52 };
    case 'tabs': {
      const i = Math.min(n - 1, Math.max(0, st.active ?? n - 1));
      const cell = (sz.w - 40) / n;
      return { x: -sz.w / 2 + 20 + cell * (i + 0.5), y: 8 };
    }
    case 'checklist':
      return { x: -sz.w / 2 + 78, y: -sz.h / 2 + 118 };
    case 'progress':
      return { x: sz.w / 2 - 110, y: -sz.h / 2 + 70 };
    case 'card':
      return { x: sz.w * 0.2, y: -sz.h / 2 + 70 };
    default:
      return null; // terminal / toast: the cursor steps aside
  }
};

export const InterfaceMorph: React.FC<{ scene: Scene }> = ({ scene }) => {
  const edit = useEdit();
  const slot = scene.slots['slot_ui'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();
  const meta = useSceneMeta();
  const depth = useDepth();
  const mayBlur = useMotionBlurOn() && depth.blur;

  const states: InterfaceState[] = (slot?.states ?? [])
    .filter((s) => s && KINDS.includes(s.kind))
    .slice(0, 5);
  if (!slot || states.length === 0) return null;

  const t = frame / fps;
  const heading = (slot.heading ?? '').trim();
  const portrait = height > width;

  // ---- When each state lands: on its cue word, else an even spread --------
  const intro = 0.25;
  const land = beatFrames(scene.narration_words ?? undefined, states.length, fps, {
    first: Math.round(fps * 0.35),
    last: Math.round(durationInFrames * 0.8),
    minGap: Math.round(fps * 1.1),
    texts: states.map((s) => (s.cue || s.text || '').trim()),
  }).map((f) => f / fps);
  // State i takes the stage a breath before its word; the ACTION (click,
  // drag, keystroke) lands on the word itself.
  const showAt = states.map((_, i) => (i === 0 ? intro : Math.max(land[i] - 0.2, land[i - 1] + 0.6)));
  const actAt = states.map((_, i) => Math.max(showAt[i] + 0.45, land[i]));
  const sizes = states.map(sizeOf);

  // ---- The one shape: size, corners, fill spring between states -----------
  const seq: TrackKey[] = [];
  const W = track(sizes[0].w, states.slice(1).map((_, k) => [showAt[k + 1], sizes[k + 1].w] as TrackKey));
  const H = track(sizes[0].h, states.slice(1).map((_, k) => [showAt[k + 1], sizes[k + 1].h] as TrackKey));
  const R = track(sizes[0].r, states.slice(1).map((_, k) => [showAt[k + 1], sizes[k + 1].r] as TrackKey));
  const darkT = track(sizes[0].dark ? 1 : 0, states.slice(1).map((_, k) => [showAt[k + 1], sizes[k + 1].dark ? 1 : 0, [20, 1]] as TrackKey));
  void seq;
  // The camera: each state fills a readable share of the stage.
  const stageW = width * (portrait ? 0.9 : 0.78);
  const stageH = height * (heading ? 0.56 : 0.66);
  const camFor = (s: Size): number => Math.min(1.7, Math.max(0.55, Math.min(stageW / (s.w * u), stageH / (s.h * u))));
  const CAM = track(camFor(sizes[0]), states.slice(1).map((_, k) => [showAt[k + 1], camFor(sizes[k + 1]), SPR.CAM] as TrackKey));
  const popIn = springStep(t - intro + 0.1, 17, 0.72);

  const cam = CAM(t) * (0.9 + 0.1 * popIn);
  const shapeW = W(t) * u;
  const shapeH = H(t) * u;
  const radius = R(t) * u;
  const dark = clamp01(darkT(t));

  const cx = width / 2;
  const headBlock = heading ? (portrait ? 190 : 150) * u : 0;
  const cy = height / 2 + headBlock * 0.42;

  // Colours: the shape is the theme's panel; the terminal flips to ink.
  const panel = theme.panel;
  const termBg = '#0B0D10';
  const shapeBg = dark > 0.5 ? termBg : panel;
  const ink = theme.text;
  const soft = hairline(theme, 0.1);

  // ---- The cursor's flight -------------------------------------------------
  const toScreen = (p: { x: number; y: number }, at: number): { x: number; y: number } => ({
    x: cx + CAM(at) * p.x * u,
    y: cy + CAM(at) * p.y * u,
  });
  const rest = { x: width * 0.78, y: height * 0.86 };
  type Key = { t: number; x: number; y: number };
  const keys: Key[] = [{ t: 0, ...rest }, { t: intro + 0.2, ...rest }];
  const clicks: number[] = [];
  const drags: [number, number][] = [];
  states.forEach((st, i) => {
    const tg = targetOf(st, sizes[i]);
    const a = actAt[i];
    if (!tg) {
      { const last = keys[keys.length - 1]; keys.push({ t: Math.max(last.t + 0.05, a - 0.5), x: last.x, y: last.y }); }
      keys.push({ t: a, x: width * 0.8, y: height * 0.84 });
      return;
    }
    const leave = Math.max(keys[keys.length - 1].t + 0.05, a - 0.62);
    keys.push({ t: leave, x: keys[keys.length - 1].x, y: keys[keys.length - 1].y });
    const p = toScreen(tg, a);
    keys.push({ t: a - 0.1, ...p });
    if (st.kind === 'slider') {
      const sz = sizes[i];
      const v = clamp01((st.value ?? 75) / 100);
      const end = toScreen({ x: -sz.w / 2 + 70 + (sz.w - 140) * v, y: tg.y }, a + 0.95);
      drags.push([a, a + 0.95]);
      keys.push({ t: a + 0.95, ...end });
    } else if (st.kind === 'checklist') {
      const n = Math.min(4, st.items?.length ?? 0);
      for (let k = 0; k < n; k++) {
        const at = a + k * 0.38;
        clicks.push(at);
        keys.push({ t: at - 0.06, ...toScreen({ x: tg.x, y: tg.y + k * 96 }, at) });
      }
    } else {
      clicks.push(a);
      keys.push({ t: a + 0.15, ...p });
    }
  });
  const cursorAt = (tt: number): { x: number; y: number } => {
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t <= tt) i++;
    const k0 = keys[i];
    const k1 = keys[Math.min(keys.length - 1, i + 1)];
    if (k1 === k0 || k1.t <= k0.t) return { x: k0.x, y: k0.y };
    const p = easeInOutCubic(clamp01((tt - k0.t) / (k1.t - k0.t)));
    // A slight human arc: offset perpendicular to the path, zero at the ends.
    const dx = k1.x - k0.x;
    const dy = k1.y - k0.y;
    const len = Math.hypot(dx, dy) || 1;
    const arc = Math.sin(p * Math.PI) * Math.min(60 * u, len * 0.12);
    return { x: k0.x + dx * p - (dy / len) * arc, y: k0.y + dy * p + (dx / len) * arc };
  };
  const cursorIn = clamp01((t - intro - 0.1) / 0.3) * (1 - clamp01((t - (actAt[actAt.length - 1] + 1.6)) / 0.4));

  // ---- Per-state content ---------------------------------------------------
  const layer = (i: number): React.ReactNode => {
    const st = states[i];
    const sz = sizes[i];
    const tout = i < states.length - 1 ? showAt[i + 1] : null;
    const v = swapVis(t, i === 0 ? intro : showAt[i], tout);
    if (v.o < 0.002) return null;
    const blur = mayBlur ? v.blurT * 10 : 0;
    const a = actAt[i];
    const since = t - a;
    const text = (st.text ?? '').trim();
    const items = (st.items ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4);
    const onDark = sz.dark;
    const fg = onDark ? '#E8ECEF' : ink;
    const muted = onDark ? 'rgba(232,236,239,0.55)' : theme.muted;

    let body: React.ReactNode = null;
    switch (st.kind) {
      case 'button': {
        const press = clicks.includes(a) ? springStep(since, SPR.PRESS[0], SPR.PRESS[1]) : 0;
        const pressed = since >= 0 ? 1 : 0;
        const fill = pressed ? theme.accent : 'transparent';
        const dip = since >= 0 ? 1 - 0.06 * Math.sin(Math.min(1, since / 0.18) * Math.PI) : 1;
        body = (
          <div style={{ position: 'absolute', inset: 10 * u, borderRadius: (sz.r - 10) * u, background: fill, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22 * u, transform: `scale(${dip})`, border: pressed ? 'none' : `${3 * u}px solid ${theme.accent}` }}>
            <span style={{ fontFamily: displayFont, fontWeight: 800, fontSize: 50 * u, color: pressed ? inkOn(theme.accent) : fg, whiteSpace: 'nowrap' }}>{text || 'Continue'}</span>
            <svg width={44 * u} height={44 * u} viewBox="0 0 24 24" fill="none" stroke={pressed ? inkOn(theme.accent) : theme.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ transform: `translateX(${press * 8 * u}px)` }}>
              <path d="M5 12h14" />
              <path d="M13 5l7 7-7 7" />
            </svg>
          </div>
        );
        break;
      }
      case 'search': {
        const typed = Math.round(clamp01((since - 0.1) / Math.max(0.5, text.length * 0.045)) * text.length);
        const doneAt = a + 0.1 + Math.max(0.5, text.length * 0.045);
        const caret = since >= 0 && Math.floor(t * 2.2) % 2 === 0;
        body = (
          <div style={{ position: 'absolute', inset: 0, padding: `${34 * u}px ${44 * u}px` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 22 * u, height: 68 * u, borderBottom: items.length ? `1px solid ${soft}` : 'none', paddingBottom: items.length ? 26 * u : 0, boxSizing: 'content-box' }}>
              <svg width={40 * u} height={40 * u} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={2.2} strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <span style={{ fontFamily: BODY_FONT, fontSize: 42 * u, color: typed ? fg : muted, whiteSpace: 'nowrap' }}>
                {typed ? text.slice(0, typed) : 'Search'}
                <span style={{ display: 'inline-block', width: 3 * u, height: 44 * u, marginLeft: 4 * u, verticalAlign: 'middle', background: theme.accent, opacity: caret ? 1 : 0 }} />
              </span>
            </div>
            {items.map((it, k) => {
              const e = easeOutCubic(clamp01((t - doneAt - 0.1 - k * 0.12) / 0.3));
              const hot = k === 0 && t > doneAt + 0.5;
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 20 * u, height: 88 * u, marginTop: k === 0 ? 14 * u : 0, padding: `0 ${18 * u}px`, borderRadius: 20 * u, background: hot ? hairline(theme, 0.08) : 'transparent', opacity: e, transform: `translateY(${(1 - e) * 16 * u}px)` }}>
                  <div style={{ width: 12 * u, height: 12 * u, borderRadius: 6 * u, background: hot ? theme.accent : muted, flexShrink: 0 }} />
                  <span style={{ fontFamily: BODY_FONT, fontSize: 36 * u, color: fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it}</span>
                </div>
              );
            })}
          </div>
        );
        break;
      }
      case 'toggle': {
        const on = (st.value ?? 1) >= 0.5;
        const flip = since >= 0 ? springStep(since, SPR.FAST[0], SPR.FAST[1]) : 0;
        const p = on ? flip : 1 - flip;
        const trackW = 150 * u;
        const trackH = 84 * u;
        body = (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${56 * u}px 0 ${64 * u}px` }}>
            <span style={{ fontFamily: displayFont, fontWeight: 800, fontSize: 48 * u, color: fg, whiteSpace: 'nowrap' }}>{text}</span>
            <div style={{ position: 'relative', width: trackW, height: trackH, borderRadius: trackH / 2, background: p > 0.5 ? theme.accent : hairline(theme, 0.22), flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 8 * u, left: 8 * u + p * (trackW - trackH), width: trackH - 16 * u, height: trackH - 16 * u, borderRadius: '50%', background: p > 0.5 ? inkOn(theme.accent) : ink, transform: `scaleX(${1 + 0.25 * Math.sin(clamp01(flip) * Math.PI)})` }} />
            </div>
          </div>
        );
        break;
      }
      case 'slider':
      case 'progress': {
        const isSlider = st.kind === 'slider';
        const target = clamp01((st.value ?? (isSlider ? 75 : 100)) / 100);
        const start = isSlider ? 0.08 : 0;
        const dur = isSlider ? 0.95 : 1.3;
        const lin = clamp01(since / dur);
        const val = start + (target - start) * (isSlider ? easeInOutCubic(lin) : easeOutCubic(lin));
        const trackX = 70 * u;
        const trackW = sz.w * u - 140 * u;
        // Liquid fill: the leading edge chases the value on FAST, the
        // start edge gives a tiny SLOW tug so the bar reads as elastic.
        const edge = liquidEdges([0, start], [[a, 0, target]]);
        const e = edge(t);
        const right = isSlider ? val : since >= 0 ? Math.min(val, e.right) : start;
        const shownPct = Math.round((isSlider ? val : right) * 100);
        body = (
          <div style={{ position: 'absolute', inset: 0 }}>
            <div style={{ position: 'absolute', left: trackX, right: trackX, top: 46 * u, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: displayFont, fontWeight: 800, fontSize: 46 * u, color: fg, whiteSpace: 'nowrap' }}>{text}</span>
              {st.value != null ? (
                <span style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 40 * u, color: theme.accent, fontVariantNumeric: 'tabular-nums' }}>{shownPct}%</span>
              ) : null}
            </div>
            <div style={{ position: 'absolute', left: trackX, width: trackW, top: sz.h * u / 2 + 34 * u, height: 16 * u, borderRadius: 8 * u, background: hairline(theme, 0.14) }} />
            <div style={{ position: 'absolute', left: trackX + Math.max(0, e.left - 0) * 0, width: Math.max(16 * u, trackW * right), top: sz.h * u / 2 + 34 * u, height: 16 * u, borderRadius: 8 * u, background: theme.accent }} />
            {isSlider ? (
              <div style={{ position: 'absolute', left: trackX + trackW * val - 22 * u, top: sz.h * u / 2 + 34 * u - 14 * u, width: 44 * u, height: 44 * u, borderRadius: '50%', background: panel, border: `${5 * u}px solid ${theme.accent}`, boxSizing: 'border-box', transform: `scale(${1 + 0.18 * (drags.some(([d0, d1]) => t >= d0 && t <= d1) ? 1 : 0)})` }} />
            ) : null}
            {(st.items ?? []).length >= 2 ? (
              <div style={{ position: 'absolute', left: trackX, right: trackX, top: sz.h * u / 2 + 72 * u, display: 'flex', justifyContent: 'space-between', fontFamily: MONO_FONT, fontSize: 24 * u, letterSpacing: 2 * u, textTransform: 'uppercase', color: muted }}>
                <span>{st.items![0]}</span>
                <span>{st.items![st.items!.length - 1]}</span>
              </div>
            ) : null}
          </div>
        );
        break;
      }
      case 'tabs': {
        const opts = items.length >= 2 ? items : ['One', 'Two'];
        const n = opts.length;
        const cell = (sz.w - 40) / n;
        const active = Math.min(n - 1, Math.max(0, st.active ?? n - 1));
        const edges = liquidEdges([0, 1], [[a, active, active + 1]]);
        const e = edges(t);
        const lab = fitText(opts.reduce((m, o) => (o.length > m.length ? o : m), ''), { width: (cell - 40) * u, max: 40 * u, min: 22 * u, maxLines: 1, font: BODY_FONT, weight: 700, kinetic: false });
        body = (
          <div style={{ position: 'absolute', inset: 0 }}>
            <div style={{ position: 'absolute', top: 18 * u, bottom: 18 * u, left: (20 + e.left * cell) * u, width: (e.right - e.left) * cell * u, borderRadius: (sz.h / 2 - 18) * u, background: theme.accent }} />
            {opts.map((o, k) => {
              const on = Math.abs((e.left + e.right) / 2 - (k + 0.5)) < 0.5;
              return (
                <div key={k} style={{ position: 'absolute', top: 0, bottom: 0, left: (20 + k * cell) * u, width: cell * u, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: BODY_FONT, fontWeight: 700, fontSize: lab, color: on ? inkOn(theme.accent) : muted, whiteSpace: 'nowrap' }}>
                  {o}
                </div>
              );
            })}
          </div>
        );
        break;
      }
      case 'checklist': {
        body = (
          <div style={{ position: 'absolute', inset: 0, padding: `${40 * u}px ${48 * u}px` }}>
            {text ? <div style={{ fontFamily: displayFont, fontWeight: 800, fontSize: 40 * u, color: fg, marginBottom: 14 * u, whiteSpace: 'nowrap' }}>{text}</div> : null}
            {items.map((it, k) => {
              const at = a + k * 0.38;
              const c = clamp01((t - at) / 0.22);
              const rowIn = easeOutCubic(clamp01((t - showAt[i] - 0.15 - k * 0.08) / 0.3));
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 26 * u, height: 96 * u, opacity: rowIn }}>
                  <div style={{ width: 52 * u, height: 52 * u, borderRadius: 14 * u, border: `${3 * u}px solid ${c > 0 ? theme.accent : hairline(theme, 0.3)}`, background: c > 0.4 ? theme.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxSizing: 'border-box' }}>
                    <svg width={34 * u} height={34 * u} viewBox="0 0 24 24" fill="none" stroke={inkOn(theme.accent)} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" strokeDasharray={24} strokeDashoffset={24 * (1 - c)} />
                    </svg>
                  </div>
                  <span style={{ fontFamily: BODY_FONT, fontSize: 38 * u, color: c > 0.5 ? fg : muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it}</span>
                </div>
              );
            })}
          </div>
        );
        break;
      }
      case 'terminal': {
        const lines = items.length ? items : [text];
        let clock = a + 0.1;
        body = (
          <div style={{ position: 'absolute', inset: 0 }}>
            <div style={{ position: 'absolute', top: 28 * u, left: 34 * u, display: 'flex', gap: 14 * u }}>
              {[0, 1, 2].map((d) => (
                <div key={d} style={{ width: 18 * u, height: 18 * u, borderRadius: '50%', background: 'rgba(232,236,239,0.22)' }} />
              ))}
            </div>
            <div style={{ position: 'absolute', top: 86 * u, left: 44 * u, right: 44 * u, fontFamily: MONO_FONT, fontSize: 34 * u, lineHeight: `${64 * u}px`, color: fg }}>
              {lines.map((ln, k) => {
                const dur = Math.max(0.35, ln.length * 0.035);
                const start = clock;
                clock += dur + 0.18;
                const n = Math.round(clamp01((t - start) / dur) * ln.length);
                if (t < start) return null;
                const typing = n < ln.length;
                return (
                  <div key={k} style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <span style={{ color: theme.accent }}>{k === 0 ? '$ ' : '> '}</span>
                    {ln.slice(0, n)}
                    {typing || k === lines.length - 1 ? <span style={{ display: 'inline-block', width: 18 * u, height: 36 * u, marginLeft: 4 * u, verticalAlign: 'middle', background: fg, opacity: Math.floor(t * 2.2) % 2 === 0 ? 0.9 : 0 }} /> : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
        break;
      }
      case 'card': {
        body = (
          <div style={{ position: 'absolute', inset: 0, padding: `${46 * u}px ${54 * u}px` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 * u, marginBottom: 24 * u }}>
              <div style={{ width: 14 * u, height: 14 * u, borderRadius: 7 * u, background: theme.accent }} />
              <span style={{ fontFamily: displayFont, fontWeight: 800, fontSize: 46 * u, color: fg, whiteSpace: 'nowrap' }}>{text}</span>
            </div>
            {items.map((it, k) => {
              const e = easeOutCubic(clamp01((t - a - 0.1 - k * 0.14) / 0.3));
              return (
                <div key={k} style={{ height: 66 * u, display: 'flex', alignItems: 'center', borderTop: `1px solid ${soft}`, fontFamily: BODY_FONT, fontSize: 34 * u, color: muted, opacity: e, transform: `translateX(${(1 - e) * 18 * u}px)`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {it}
                </div>
              );
            })}
          </div>
        );
        break;
      }
      case 'toast':
      default: {
        const c = clamp01((since + 0.1) / 0.3);
        body = (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 26 * u, padding: `0 ${50 * u}px` }}>
            <div style={{ width: 70 * u, height: 70 * u, borderRadius: '50%', background: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width={40 * u} height={40 * u} viewBox="0 0 24 24" fill="none" stroke={inkOn(theme.accent)} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" strokeDasharray={24} strokeDashoffset={24 * (1 - c)} />
              </svg>
            </div>
            <span style={{ fontFamily: displayFont, fontWeight: 800, fontSize: 44 * u, color: fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
          </div>
        );
      }
    }

    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: sz.w * u,
          height: sz.h * u,
          marginLeft: (-sz.w * u) / 2,
          marginTop: (-sz.h * u) / 2,
          opacity: v.o,
          transform: `scale(${v.s})`,
          filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
        }}
      >
        {body}
      </div>
    );
  };

  const headIn = easeOutCubic(clamp01((t - 0.05) / 0.4));

  return (
    <AbsoluteFill>
      {heading ? (
        <div style={{ position: 'absolute', top: height * (portrait ? 0.1 : 0.09), left: '8%', right: '8%', textAlign: 'center', opacity: headIn }}>
          <h1
            {...edit('heading', {
              margin: 0,
              fontFamily: displayFont,
              fontWeight: 900,
              fontSize: fitText(heading, { width: width * 0.8, max: 64 * u, min: 38 * u, maxLines: 2, font: displayFont, weight: 900 }),
              lineHeight: 1.05,
              color: theme.text,
            })}
          >
            <KineticText text={edit.text('heading', heading)} />
          </h1>
        </div>
      ) : null}

      {/* The one shape. Its box springs between states; content layers are
          laid out at their own state's size and clipped by it. */}
      <div
        style={{
          position: 'absolute',
          left: cx,
          top: cy,
          width: shapeW,
          height: shapeH,
          marginLeft: -shapeW / 2,
          marginTop: -shapeH / 2,
          borderRadius: radius,
          background: shapeBg,
          border: dark > 0.5 ? 'none' : `1px solid ${hairline(theme, 0.1)}`,
          overflow: 'hidden',
          transform: `scale(${cam * popIn})`,
          opacity: clamp01(popIn * 1.4),
        }}
      >
        {states.map((_, i) => layer(i))}
      </div>

      <Cursor
        pos={cursorAt(t)}
        opacity={cursorIn}
        t={t}
        clicks={clicks}
        drags={drags}
        accent={theme.accent}
        u={u}
        blur={mayBlur}
        prevPos={cursorAt(t - 1 / fps)}
      />
    </AbsoluteFill>
  );
};
