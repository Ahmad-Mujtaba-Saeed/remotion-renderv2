import React from 'react';
import { CinematicBar, CinematicElement, CinematicPatch, CinematicRow, CinematicTone, Theme } from '../types';
import { hairline, MONO_FONT } from '../theme';
import { IconStroke } from '../icons/IconStroke';
import { cinematicProgress } from '@webprodigies/flute';
import { staticFile } from 'remotion';

/**
 * The cinematic card's DIAGRAM LANGUAGE — the drawn parts.
 *
 * Modelled on the systems-explainer style the user pointed at: every piece of
 * the explanation is drawn as the thing itself — a dark panel with an icon, a
 * mono uppercase title, a status on the right and ONE body (key/value rows,
 * load bars, code lines or placeholder data), a browser window, a request
 * pill, a dot-grid crowd — and the drawing CHANGES while the narrator talks
 * (a status flips, bars refill, the crowd lights up).
 *
 * These are fixed designs the planner fills with words, never markup it
 * writes: free-form html from a model that cannot see its output comes back
 * inconsistent, and a diagram language is only a language if every panel
 * looks like every other one. Every kind has deterministic METRICS, so the
 * card knows each part's exact box before it renders — that is what lets it
 * fit the part to its cell and anchor the links to its edges.
 *
 * All sizes are design px at 1080p; the caller scales by `u` and the fit.
 */

/** The one colour outside the theme: a state gone wrong. Reads on dark and light. */
export const BAD = '#E5655D';

export const toneColor = (theme: Theme, tone: CinematicTone | undefined, fallback?: string): string => {
  switch (tone) {
    case 'accent':
      return theme.accent;
    case 'bad':
      return BAD;
    case 'muted':
      return theme.muted;
    case 'plain':
      return theme.text;
    default:
      return fallback ?? theme.text;
  }
};

/** `#rrggbb` (or `#rgb`) at an alpha; anything else passes through. */
export const alpha = (color: string, a: number): string => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export const DRAWN_KINDS = ['visual', 'panel', 'browser', 'crowd', 'pill'] as const;
export const isDrawn = (el: CinematicElement): boolean => (DRAWN_KINDS as readonly string[]).includes(el.kind);

// ---- Metrics ---------------------------------------------------------------

const PAD = 22;
const HEAD = 28;
const GAP = 18;
const ROW_H = 44;
const ROW_GAP = 8;
const BAR_H = 40;
const BAR_GAP = 10;
const LINE_H = 28;
const SKEL_H = 12;
const SKEL_GAP = 12;
const NOTE_H = 30;
const CHROME = 46;
const BUTTON_H = 48;
const PANEL_W = 520;
const PANEL_W_BARE = 340;
const BROWSER_W = 560;
const CROWD_COLS = 12;
const CROWD_ROWS = 8;
const CROWD_PITCH = 20;
/** A generated visual: the picture box, then the words under it. */
const VIS_W = 340;
const VIS_IMG_H = 240;
const VIS_LABEL_H = 34;
const VIS_NOTE_H = 26;

const bodyHeight = (el: CinematicElement): number => {
  if (el.rows?.length) return el.rows.length * ROW_H + (el.rows.length - 1) * ROW_GAP;
  if (el.bars?.length) return el.bars.length * BAR_H + (el.bars.length - 1) * BAR_GAP;
  if (el.lines?.length) return el.lines.length * LINE_H;
  if (el.skeleton) return el.skeleton * SKEL_H + (el.skeleton - 1) * SKEL_GAP;
  return 0;
};

/** Natural size (design px) of a drawn part, or null for the typographic kinds. */
export const naturalSize = (el: CinematicElement): { w: number; h: number } | null => {
  switch (el.kind) {
    case 'panel': {
      const body = bodyHeight(el);
      // A panel with nothing but a title (a balancer, a queue) is a small
      // box, not a wide empty card.
      // Wide enough for its header: the title is never cut to "LOAD BALAN…".
      const header =
        PAD * 2 + (el.icon ? 36 : 0) + (el.title ?? '').length * 14.6 +
        (el.subtitle ? 22 + el.subtitle.length * 11 : 0) + (el.status ? 26 + el.status.length * 11.2 : 0);
      const w = Math.min(640, Math.max(body ? PANEL_W : PANEL_W_BARE, header));
      return { w, h: PAD * 2 + HEAD + (body ? GAP + body : 0) + (el.note ? NOTE_H : 0) };
    }
    case 'browser': {
      const head = el.title || el.status ? HEAD + GAP : 0;
      const body = bodyHeight(el);
      const button = el.button ? BUTTON_H + (body ? GAP : 0) : 0;
      return {
        w: BROWSER_W,
        // An empty window still reads as a window, not a strip.
        h: Math.max(CHROME + 150, CHROME + PAD * 2 + head + body + button + (el.note ? NOTE_H : 0)),
      };
    }
    case 'visual':
      return {
        // A part whose drawing was refused (the image model gave back a
        // texture, or nothing) keeps its words and takes only their room —
        // an empty picture frame in the middle of a diagram reads as broken.
        w: VIS_W,
        h: (el.image_url ? VIS_IMG_H : 0) + (el.title || el.status ? VIS_LABEL_H : 0) + (el.note ? VIS_NOTE_H : 0),
      };
    case 'crowd':
      return { w: CROWD_COLS * CROWD_PITCH, h: CROWD_ROWS * CROWD_PITCH + (el.text ? 30 : 0) };
    case 'pill': {
      const chars = (el.text ?? '').length + (el.status ?? '').length;
      return { w: Math.max(220, Math.min(480, 90 + chars * 12.5)), h: 64 };
    }
    default:
      return null;
  }
};

/**
 * The part's content box inside its cell (px, before perspective): drawn
 * parts at their natural size fitted to the cell; typographic parts at a
 * conservative share of it. The links attach to this box's edges.
 */
export const contentBox = (el: CinematicElement, cell: { w: number; h: number }, u: number) => {
  const n = naturalSize(el);
  if (!n) return { w: cell.w * 0.72, h: cell.h * 0.56, scale: 1 };
  // 84% of the cell's width: the gap between neighbours is where the links
  // run, and a diagram whose connectors are 40px long is just touching boxes.
  const scale = Math.min((cell.w * 0.84) / (n.w * u), (cell.h * 0.9) / (n.h * u), 1.35);
  return { w: n.w * u * scale, h: n.h * u * scale, scale };
};

// ---- State over time ---------------------------------------------------------

/**
 * A part's state at a frame: its base fields with every patch that has
 * landed applied in order, plus the state BEFORE the latest patch and the
 * eased progress since it — enough to animate the change (bars refill, the
 * crowd lights up, a status swaps with a small pop).
 */
export const partState = (
  el: CinematicElement,
  patchAt: number[],
  frame: number,
  fps: number
): { now: CinematicElement; before: CinematicElement; t: number } => {
  const patches = el.then ?? [];
  let before = el;
  let now = el;
  let last = -1;
  patches.forEach((p, k) => {
    if (frame >= (patchAt[k] ?? Infinity)) {
      before = now;
      now = applyPatch(now, p);
      last = k;
    }
  });
  if (last < 0) return { now: el, before: el, t: 1 };
  const t = cinematicProgress(Math.max(0, Math.min(1, (frame - patchAt[last]) / Math.round(fps * 0.6))));
  return { now, before, t };
};

const applyPatch = (el: CinematicElement, p: CinematicPatch): CinematicElement => ({
  ...el,
  ...(p.status !== undefined ? { status: p.status } : {}),
  ...(p.tone !== undefined ? { tone: p.tone } : {}),
  ...(p.rows !== undefined ? { rows: p.rows } : {}),
  ...(p.bars !== undefined ? { bars: p.bars } : {}),
  ...(p.lit !== undefined ? { lit: p.lit } : {}),
  ...(p.note !== undefined ? { note: p.note } : {}),
  ...(p.text !== undefined ? { text: p.text } : {}),
});

// ---- Rendering ---------------------------------------------------------------

type DrawnProps = {
  el: CinematicElement;
  before: CinematicElement;
  /** 0..1 since the latest patch (1 when none). */
  t: number;
  /** 0..1 entrance of the part itself. */
  enter: number;
  theme: Theme;
  /** Deterministic seed (the part index). */
  seed: number;
};

/** Sub-items build in one after another as the part settles. */
const stagger = (enter: number, k: number) => Math.max(0, Math.min(1, (enter - 0.35 - k * 0.1) / 0.35));

/** Deterministic 0..1 hash. */
const hash = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const mono = (size: number, weight: number, color: string, spacing = 2): React.CSSProperties => ({
  fontFamily: MONO_FONT,
  fontSize: size,
  fontWeight: weight,
  color,
  letterSpacing: spacing,
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

/** A status that swapped pops once, so the eye catches the change. */
const popScale = (t: number) => 1 + 0.12 * Math.sin(Math.PI * Math.min(1, t * 1.4)) * (t < 1 ? 1 : 0);

const Header: React.FC<{ el: CinematicElement; before: CinematicElement; t: number; theme: Theme }> = ({ el, before, t, theme }) => {
  const statusColor = toneColor(theme, el.tone, theme.accent);
  const changed = before.status !== el.status || before.tone !== el.tone;
  return (
    <div style={{ height: HEAD, display: 'flex', alignItems: 'center', gap: 12 }}>
      {el.icon ? (
        <IconStroke name={el.icon} progress={1} size={24} color={el.tone === 'bad' ? BAD : theme.accent} strokeWidth={1.8} />
      ) : null}
      <div style={{ ...mono(20, 800, theme.text, 2.4), flex: '0 1 auto', minWidth: 0 }}>{el.title ?? el.text ?? ''}</div>
      {el.subtitle ? <div style={{ ...mono(15, 500, theme.muted, 1.8), flex: 1, minWidth: 0 }}>· {el.subtitle}</div> : <div style={{ flex: 1 }} />}
      {el.status ? (
        <div
          style={{
            ...mono(15, 800, statusColor, 2),
            flex: 'none',
            maxWidth: 190,
            transform: changed ? `scale(${popScale(t)})` : undefined,
            transformOrigin: 'right center',
          }}
        >
          {el.status}
        </div>
      ) : null}
    </div>
  );
};

const Rows: React.FC<{ rows: CinematicRow[]; enter: number; theme: Theme }> = ({ rows, enter, theme }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: ROW_GAP }}>
    {rows.map((r, k) => {
      const hot = r.tone === 'accent';
      const color = toneColor(theme, r.tone, theme.text);
      return (
        <div
          key={k}
          style={{
            height: ROW_H,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            padding: '0 16px',
            borderRadius: 8,
            background: hot ? alpha(theme.accent, 0.12) : hairline(theme, 0.04),
            border: `1px solid ${hot ? alpha(theme.accent, 0.3) : hairline(theme, 0.06)}`,
            opacity: stagger(enter, k),
          }}
        >
          <div style={{ ...mono(14, 600, hot ? theme.text : theme.muted, 2), minWidth: 0 }}>{r.label}</div>
          <div style={{ ...mono(15, 800, color, 1.6), flex: 'none', maxWidth: '60%' }}>{r.value}</div>
        </div>
      );
    })}
  </div>
);

const Bars: React.FC<{ bars: CinematicBar[]; before?: CinematicBar[]; t: number; enter: number; theme: Theme }> = ({
  bars,
  before,
  t,
  enter,
  theme,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: BAR_GAP }}>
    {bars.map((b, k) => {
      const from = before?.[k]?.value ?? 0;
      // Bars grow in on entrance, then refill smoothly on a patch.
      const grow = cinematicProgress(stagger(enter, k));
      const v = (from + (b.value - from) * t) * grow;
      const color = toneColor(theme, b.tone, theme.accent);
      return (
        <div key={k} style={{ height: BAR_H, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ ...mono(13, 600, theme.muted, 2), minWidth: 0 }}>{b.label}</div>
            <div style={mono(13, 800, color, 1.4)}>{Math.round(v * 100)}%</div>
          </div>
          <div style={{ height: 14, borderRadius: 4, background: hairline(theme, 0.07), overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, height: '100%', borderRadius: 4, background: color }} />
          </div>
        </div>
      );
    })}
  </div>
);

const Lines: React.FC<{ lines: string[]; enter: number; theme: Theme }> = ({ lines, enter, theme }) => (
  <div>
    {lines.map((line, k) => (
      <div key={k} style={{ height: LINE_H, display: 'flex', gap: 16, alignItems: 'center', opacity: stagger(enter, k) }}>
        <span style={{ fontFamily: MONO_FONT, fontSize: 15, color: theme.muted, width: 16, textAlign: 'right' }}>{k + 1}</span>
        <span style={{ fontFamily: MONO_FONT, fontSize: 16, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {line}
        </span>
      </div>
    ))}
  </div>
);

const Skeleton: React.FC<{ n: number; enter: number; theme: Theme; seed: number; tone?: CinematicTone }> = ({ n, enter, theme, seed, tone }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: SKEL_GAP }}>
    {Array.from({ length: n }, (_, k) => (
      <div
        key={k}
        style={{
          height: SKEL_H,
          width: `${62 + 34 * hash(seed, k)}%`,
          borderRadius: 4,
          background: tone === 'accent' ? alpha(theme.accent, 0.55) : hairline(theme, 0.16),
          opacity: stagger(enter, k),
        }}
      />
    ))}
  </div>
);

const Body: React.FC<DrawnProps> = ({ el, before, t, enter, theme, seed }) => {
  if (el.rows?.length) return <Rows rows={el.rows} enter={enter} theme={theme} />;
  if (el.bars?.length) return <Bars bars={el.bars} before={before.bars} t={t} enter={enter} theme={theme} />;
  if (el.lines?.length) return <Lines lines={el.lines} enter={enter} theme={theme} />;
  if (el.skeleton) return <Skeleton n={el.skeleton} enter={enter} theme={theme} seed={seed} tone={el.tone} />;
  return null;
};

const Note: React.FC<{ note?: string; theme: Theme }> = ({ note, theme }) =>
  note ? <div style={{ ...mono(12.5, 600, theme.muted, 2.2), marginTop: 14, height: 16 }}>{note}</div> : null;

const frameStyle = (theme: Theme, w: number, h: number, tone?: CinematicTone): React.CSSProperties => ({
  width: w,
  height: h,
  boxSizing: 'border-box',
  borderRadius: 14,
  background: theme.panel,
  border: `1px solid ${tone === 'bad' ? alpha(BAD, 0.45) : hairline(theme, 0.1)}`,
  overflow: 'hidden',
});

export const Panel: React.FC<DrawnProps> = (p) => {
  const size = naturalSize(p.el)!;
  const hasBody = bodyHeight(p.el) > 0;
  return (
    <div style={{ ...frameStyle(p.theme, size.w, size.h, p.el.tone), padding: PAD }}>
      <Header el={p.el} before={p.before} t={p.t} theme={p.theme} />
      {hasBody ? (
        <div style={{ marginTop: GAP }}>
          <Body {...p} />
        </div>
      ) : null}
      <Note note={p.el.note} theme={p.theme} />
    </div>
  );
};

export const BrowserWindow: React.FC<DrawnProps> = (p) => {
  const { el, theme } = p;
  const size = naturalSize(el)!;
  const hasBody = bodyHeight(el) > 0;
  return (
    <div style={frameStyle(theme, size.w, size.h, el.tone)}>
      <div
        style={{
          height: CHROME,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 18px',
          borderBottom: `1px solid ${hairline(theme, 0.08)}`,
        }}
      >
        {[0, 1, 2].map((k) => (
          <div key={k} style={{ width: 10, height: 10, borderRadius: 5, background: hairline(theme, 0.2) }} />
        ))}
        <div
          style={{
            flex: 1,
            marginLeft: 16,
            height: 26,
            borderRadius: 6,
            background: hairline(theme, 0.05),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: MONO_FONT,
            fontSize: 14,
            color: theme.muted,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {el.url ?? 'yourapp.com'}
        </div>
      </div>
      <div style={{ padding: PAD }}>
        {el.title || el.status ? (
          <div style={{ marginBottom: GAP }}>
            <Header el={el} before={p.before} t={p.t} theme={theme} />
          </div>
        ) : null}
        {hasBody ? <Body {...p} /> : null}
        {el.button ? (
          <div
            style={{
              marginTop: hasBody ? GAP : 0,
              height: BUTTON_H,
              borderRadius: BUTTON_H / 2,
              background: el.tone === 'bad' ? alpha(BAD, 0.85) : theme.text,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...mono(16, 800, theme.panel, 2.4),
              opacity: stagger(p.enter, 3),
            }}
          >
            {el.button}
          </div>
        ) : null}
        <Note note={el.note} theme={theme} />
      </div>
    </div>
  );
};

/**
 * Many of something — users, requests, cells, voters — as a dot grid. `lit`
 * is the share lit in accent; the lit set flickers a little so the crowd
 * reads as ALIVE (traffic), and a patch that changes `lit` sweeps across.
 */
export const Crowd: React.FC<DrawnProps & { frame: number }> = ({ el, before, t, enter, theme, seed, frame }) => {
  const size = naturalSize(el)!;
  const lit = (before.lit ?? 0.7) + ((el.lit ?? 0.7) - (before.lit ?? 0.7)) * t;
  const color = toneColor(theme, el.tone, theme.accent);
  const phase = Math.floor(frame / 9);
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < CROWD_ROWS; r++) {
    for (let c = 0; c < CROWD_COLS; c++) {
      const i = r * CROWD_COLS + c;
      // Dots arrive column by column with the entrance.
      const born = Math.max(0, Math.min(1, (enter * 1.4 - c / CROWD_COLS) * 3));
      const base = hash(seed + 1, i);
      const on = base < lit && hash(i, phase + seed) > 0.08;
      dots.push(
        <circle
          key={i}
          cx={c * CROWD_PITCH + CROWD_PITCH / 2}
          cy={r * CROWD_PITCH + CROWD_PITCH / 2}
          r={4.6}
          fill={on ? color : hairline(theme, 0.16)}
          opacity={born}
        />
      );
    }
  }
  return (
    <div style={{ width: size.w, height: size.h }}>
      {el.text ? <div style={{ ...mono(13, 700, theme.muted, 2.4), height: 30 }}>{el.text}</div> : null}
      <svg width={CROWD_COLS * CROWD_PITCH} height={CROWD_ROWS * CROWD_PITCH} style={{ display: 'block' }}>
        {dots}
      </svg>
    </div>
  );
};

/** A request, a message, a token — a single thing in flight. */
export const Pill: React.FC<DrawnProps> = ({ el, before, t, theme }) => {
  const size = naturalSize(el)!;
  const statusColor = toneColor(theme, el.tone, theme.accent);
  const changed = before.status !== el.status;
  return (
    <div
      style={{
        width: size.w,
        height: size.h,
        boxSizing: 'border-box',
        borderRadius: size.h / 2,
        background: theme.panel,
        border: `1px solid ${el.tone === 'bad' ? alpha(BAD, 0.45) : hairline(theme, 0.12)}`,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '0 26px',
      }}
    >
      <IconStroke name={el.icon ?? 'users'} progress={1} size={22} color={theme.muted} strokeWidth={1.8} />
      <div style={{ fontFamily: MONO_FONT, fontSize: 18, fontWeight: 600, color: theme.text, whiteSpace: 'nowrap', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {el.text ?? ''}
      </div>
      {el.status ? (
        <div style={{ ...mono(16, 800, statusColor, 2), transform: changed ? `scale(${popScale(t)})` : undefined }}>{el.status}</div>
      ) : null}
    </div>
  );
};

/**
 * The stencil's url as the browser must see it. A real render hands over an
 * absolute url (the storage disk); a probe or a local test hands over a path
 * inside `public/`, which Remotion serves from its own static base rather
 * than the document root — so a bare `flow/x.png` 404s unless it goes through
 * staticFile().
 */
const assetUrl = (raw?: string): string => {
  const src = (raw ?? '').trim();
  if (src === '' || /^(https?:|data:|blob:|file:)/i.test(src)) {
    return src;
  }

  return staticFile(src.replace(/^\/+/, ''));
};

/**
 * A piece the IMAGE MODEL drew for this script, with its words typeset over
 * it: the cut-out picture (transparent, so it sits on the card rather than in
 * a box), then a mono label with its state on the right, then an optional
 * note. The state swaps on its cue like any other part — that is what makes
 * it read as a component rather than a picture.
 */
export const Visual: React.FC<DrawnProps> = ({ el, before, t, enter, theme }) => {
  const size = naturalSize(el)!;
  const statusColor = toneColor(theme, el.tone, theme.accent);
  const changed = before.status !== el.status || before.tone !== el.tone;
  const src = assetUrl(el.image_url);
  return (
    <div style={{ width: size.w, height: size.h, display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* The drawing is an alpha STENCIL, so it is painted rather than pasted:
          masked in the video's own ink (accent when this part is the good or
          active one, red when it is the broken one). That is what keeps a
          generated picture on-palette and reading as a component. */}
      {src ? (
        <div style={{ height: VIS_IMG_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: '100%',
              height: '100%',
              background: el.tone === 'bad' ? BAD : el.tone === 'accent' ? theme.accent : theme.text,
              opacity: Math.max(0, Math.min(1, (enter - 0.15) / 0.5)) * (el.tone === 'muted' ? 0.55 : 1),
              WebkitMaskImage: `url(${src})`,
              maskImage: `url(${src})`,
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
            }}
          />
        </div>
      ) : null}
      {el.title || el.status ? (
        <div style={{ height: VIS_LABEL_H, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          {el.title ? <div style={mono(19, 800, theme.text, 2.4)}>{el.title}</div> : null}
          {el.status ? (
            <div
              style={{
                ...mono(15, 800, statusColor, 2),
                padding: '4px 10px',
                borderRadius: 6,
                background: el.tone === 'bad' ? alpha(BAD, 0.14) : alpha(theme.accent, 0.12),
                transform: changed ? `scale(${popScale(t)})` : undefined,
              }}
            >
              {el.status}
            </div>
          ) : null}
        </div>
      ) : null}
      {el.note ? (
        <div style={{ height: VIS_NOTE_H, ...mono(13, 600, theme.muted, 2), textAlign: 'center' }}>{el.note}</div>
      ) : null}
    </div>
  );
};

/** Draw one drawn part at its natural size (the caller scales and centres it). */
export const DrawnPart: React.FC<DrawnProps & { frame: number }> = (p) => {
  switch (p.el.kind) {
    case 'visual':
      return <Visual {...p} />;
    case 'panel':
      return <Panel {...p} />;
    case 'browser':
      return <BrowserWindow {...p} />;
    case 'crowd':
      return <Crowd {...p} />;
    case 'pill':
      return <Pill {...p} />;
    default:
      return null;
  }
};
