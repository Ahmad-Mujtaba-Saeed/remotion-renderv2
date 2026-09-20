import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, useVideoConfig } from 'remotion';
import { Scene as FluteScene, Surface } from '@webprodigies/flute';
import { CinematicElement, Scene, Theme } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT, BODY_FONT, DISPLAY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01 } from '../motion/easing';
import { useCardReveal } from '../motion/cardReveal';
import { useEdit } from '../components/Editable';
import { MathText, parseMath, mathWidthUnits } from '../math/mathText';
import { IconStroke } from '../icons/IconStroke';
import {
  BASE_PERSPECTIVE,
  DEPTH_Z,
  Cell,
  blurShare,
  cameraPath,
  restPose,
  compensation,
  entrance,
  landFrames,
  layoutCells,
} from '../flute/cinematicRig';
import { BAD, DrawnPart, alpha, contentBox, isDrawn, partState } from '../flute/parts';
import { LinkEnd, LinkLayer } from '../flute/links';
import { spokenAt } from '../motion/narrationBeats';
import { cueCss } from '../motion/htmlCues';
import { cinematicProgress } from '@webprodigies/flute';

const FOCUS = { fStop: 1.4, focalLength: 200 };

/**
 * cinematic_card — the explanation, staged in depth.
 *
 * The one card allowed to break the flat-design rule, and only inside itself:
 * the user asked for the video's key explaining beats to be CINEMATIC (Flute,
 * @webprodigies/flute) — parts that arrive out of depth and out of focus, a
 * camera that pushes in on what the narrator is talking about while the rest
 * of the picture falls soft, and a pull back to the whole thing, sharp.
 *
 * Every part is its own Flute Surface at a depth. `flute/cinematicRig` owns
 * the maths (layout, framing, focus); this component only draws the parts and
 * feeds Flute the pose for the current frame. Nothing here runs on its own
 * clock: the pose, the focus and every entrance are pure functions of the
 * scene frame, so a still and a render agree frame for frame.
 *
 * Two Flute defaults are neutralised, because this card sits on the video's
 * own background: its stage is forced to #000 inline (overridden by a scoped
 * rule), and scene diagnostics render a visible alert (hidden; logged).
 *
 * The blur is a CSS filter, which is exactly what the canvas journey forbids
 * inside its camera-scaled world (Chromium reuses mid-flight rasters and text
 * lands soft). So in canvas mode this card never renders in the world:
 * CanvasJourney lifts it into screen space as a takeover. See CanvasJourney.
 */

const ENTER_DEPTH = 520;
/** html parts are authored against a box this wide, then scaled to the cell. */
const HTML_REFERENCE_W = 600;

/** Flute ids must start alphanumeric. */
const partId = (i: number) => `part-${i}`;

export const CinematicCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const edit = useEdit();
  const slot = scene.slots['slot_cinematic'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();
  const reveal = useCardReveal();

  // ---- Hold the frame until Flute has measured every layer ------------------
  // Flute blurs a layer only once it knows its size, and it learns the size
  // from a ResizeObserver after mount. A still captured before that would come
  // out with no depth of field at all. Its diagnostics clear once everything
  // is measured; the timeout means a card that never clears cannot hold a
  // render hostage (it renders sharp instead).
  const [handle] = useState(() => delayRender('CinematicCard: flute measure', { timeoutInMilliseconds: 20000 }));
  const released = useRef(false);
  const release = useCallback(() => {
    if (!released.current) {
      released.current = true;
      continueRender(handle);
    }
  }, [handle]);
  useEffect(() => {
    const t = setTimeout(release, 2500);
    return () => {
      clearTimeout(t);
      release();
    };
  }, [release]);

  const elements: CinematicElement[] = useMemo(() => (slot?.elements ?? []).slice(0, 6), [slot]);
  const portrait = height > width;
  const P = BASE_PERSPECTIVE * u;
  const sceneFrames = Math.max(1, Math.round((scene.duration_seconds ?? 8) * fps));

  // ---- The heading zone ------------------------------------------------------
  const heading = (slot?.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? '').trim();
  const headFs = heading
    ? fitText(heading, {
        width: width * (portrait ? 0.86 : 0.78),
        max: (portrait ? 50 : 56) * u,
        min: 26 * u,
        maxLines: 2,
        font: displayFont,
        weight: 900,
      })
    : 0;
  const top = height * (portrait ? 0.07 : 0.06);
  const headZone = (kicker ? 36 * u : 0) + (heading ? headFs * 2.3 : 0);
  const stageTop = top + headZone + (kicker || heading ? 24 * u : 0);
  const stage = {
    left: width * 0.05,
    top: stageTop,
    width: width * 0.9,
    height: height - stageTop - height * (portrait ? 0.12 : 0.08),
  };

  const cells = useMemo(
    () => layoutCells(elements, stage, { width, height }, u),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elements, stage.left, stage.top, stage.width, stage.height, width, height, u]
  );

  const first = reveal.first + Math.round(fps * 0.35);
  const land = useMemo(
    () => landFrames(elements, scene.narration_words, fps, sceneFrames, first),
    [elements, scene.narration_words, fps, sceneFrames, first]
  );
  // A later cue on a part (its `then`) lands no earlier than half a second
  // after the part itself; with no cue, successive changes step 1.4s apart.
  const patchAt = useMemo(
    () =>
      elements.map((el, i) =>
        (el.then ?? []).map((p, k) => {
          const spoken = p.word ? spokenAt(scene.narration_words, p.word, fps) : null;
          const wanted =
            spoken ??
            (typeof p.at === 'number' && isFinite(p.at) ? Math.round(p.at * sceneFrames) : land[i] + Math.round(fps * 1.4 * (k + 1)));
          return Math.max(land[i] + Math.round(fps * 0.5), wanted);
        })
      ),
    [elements, scene.narration_words, fps, sceneFrames, land]
  );
  // ---- The parts the model DREW (kind html) ---------------------------------
  // Each is measured at its natural size (it sets its own width, up to the
  // reference width), and ALL of them share one scale — the smallest that
  // fits every one in its cell — so type is one size across the diagram, the
  // way a design system would have it, instead of each drawing blown up or
  // shrunk to its own cell. The frame is held until every drawing has been
  // measured; links and camera framing then use the real boxes.
  const htmlIdx = useMemo(() => elements.flatMap((el, i) => (el.kind === 'html' ? [i] : [])), [elements]);
  const [measured, setMeasured] = useState<Record<number, { w: number; h: number }>>({});
  const onMeasure = useCallback((i: number, w: number, h: number) => {
    setMeasured((prev) => (prev[i] && prev[i].w === w && prev[i].h === h ? prev : { ...prev, [i]: { w, h } }));
  }, []);
  const allMeasured = htmlIdx.every((i) => measured[i]);
  const [htmlHandle] = useState(() => (htmlIdx.length ? delayRender('CinematicCard: drawn parts') : null));
  const htmlReleased = useRef(false);
  useEffect(() => {
    if (htmlHandle === null || htmlReleased.current) return;
    const done = () => {
      if (!htmlReleased.current) {
        htmlReleased.current = true;
        continueRender(htmlHandle);
      }
    };
    if (allMeasured) done();
    const t = setTimeout(done, 3000);
    return () => clearTimeout(t);
  }, [allMeasured, htmlHandle]);
  const htmlScale = useMemo(() => {
    if (!htmlIdx.length || !allMeasured) return null;
    const fits = htmlIdx.map((i) =>
      cells[i] ? Math.min((cells[i].w * 0.9) / measured[i].w, (cells[i].h * 0.92) / measured[i].h) : 1
    );
    return Math.min(1.3, ...fits);
  }, [htmlIdx, allMeasured, measured, cells]);

  const boxes = useMemo(
    () =>
      elements.map((el, i) => {
        if (!cells[i]) return null;
        if (el.kind === 'html' && measured[i] && htmlScale !== null) {
          return { w: measured[i].w * htmlScale, h: measured[i].h * htmlScale, scale: htmlScale };
        }
        return contentBox(el, cells[i], u);
      }),
    [elements, cells, u, measured, htmlScale]
  );
  // The camera frames a drawn part by its real box (a panel is narrower than
  // its cell), so a push on a panel fills the frame with the panel.
  const frameCells = useMemo(
    () =>
      cells.map((c, i) => {
        const b = boxes[i];
        return b && (isDrawn(elements[i]) || elements[i].kind === 'html') ? { ...c, w: b.w * 1.18, h: b.h * 1.3 } : c;
      }),
    [cells, boxes, elements]
  );
  // The settled heading is one small line at the top; the establishing and
  // finale shots frame the DIAGRAM into the space under it (restPose).
  const smallFs = Math.max(24 * u, headFs * 0.62);
  const headSmallBottom = top + (kicker ? 36 * u : 0) + (heading ? smallFs * 1.25 : 0);
  const rest = useMemo(
    () =>
      restPose(
        elements.flatMap((_, i) => (cells[i] && boxes[i] ? [{ cx: cells[i].cx, cy: cells[i].cy, w: boxes[i]!.w, h: boxes[i]!.h }] : [])),
        { top: headSmallBottom + 28 * u, bottom: height * (portrait ? 0.9 : 0.94), width: width * 0.9 },
        P,
        { width, height }
      ),
    [elements, cells, boxes, headSmallBottom, u, height, width, portrait, P]
  );
  const camAt = useMemo(
    () => cameraPath(elements, frameCells, land, { P, u, fps, sceneFrames, frame: { width, height }, rest }),
    [elements, frameCells, land, P, u, fps, sceneFrames, width, height, rest]
  );
  const cam = camAt(Math.max(0, frame));

  /**
   * Flute's thin-lens blur for a part at its centre depth, as a CSS filter.
   * In the part's own coordinates, so divided by its compensation scale (the
   * perspective then scales it with everything else, as Flute's own does).
   */
  const softness = (cell: Cell, z: number, c: number): string => {
    const share = blurShare(cam, cell, z, P, { fStop: FOCUS.fStop, focalLength: FOCUS.focalLength * u });
    const px = (share * 9 * u) / c;
    return px > 0.05 ? `blur(${px.toFixed(2)}px)` : 'none';
  };
  const headIn = reveal.ease(clamp01(frame / reveal.headFrames));

  const sid = String(scene.scene_id ?? 'cine').replace(/[^a-zA-Z0-9_-]/g, '-');
  // The fragment css arrives scoped to `.cc-scope` (Support\CustomHtml); a
  // second scope per scene stops two cards mounted together (canvas mode
  // mounts every scene) from styling each other.
  const htmlCss = (slot?.css ?? '').replace(/\.cc-scope/g, `.cn-${sid} .cc-scope`);

  if (!slot || elements.length === 0) return null;

  return (
    <AbsoluteFill className={`cn-${sid}`}>
      <style>{`
.cn-${sid} [data-flute-scene]{background:transparent!important;background-color:transparent!important}
.cn-${sid} [data-flute-diagnostics]{display:none!important}
.cn-${sid} .cc-scope{color:${theme.text};font-family:${BODY_FONT};font-size:26px;line-height:1.3}
.cn-${sid} .cc-scope *{box-sizing:border-box}
.cn-${sid} .cc-scope svg{display:block;max-width:100%}
${htmlCss}
${elements
  .map((el, i) =>
    el.kind === 'html' && el.html
      ? cueCss(el.html, `.cn-${sid} .cn-p${i}`, {
          frame,
          fps,
          sceneFrames,
          words: scene.narration_words,
          reveal,
          // A cue whose word is never said appears with its part.
          fallback: land[i] ?? 0,
        })
      : ''
  )
  .join(' ')}`}</style>
      <FluteScene
        camera={{ x: cam.x, y: cam.y, z: cam.z, rotateX: cam.rx, rotateY: cam.ry, perspective: P }}
        // Depth of field is computed HERE (see `softness`), not by Flute: on a
        // rotated camera every layer is tilted and Flute switches to its
        // progressive SVG depth filter, which in headless Chrome softens the
        // WHOLE layer — the part the camera is looking at came out blurred.
        // One uniform blur per part at its centre depth keeps it crisp.
        focus={{ distance: Math.max(1, cam.focus), fStop: FOCUS.fStop, focalLength: FOCUS.focalLength * u, maxBlur: 0 }}
        style={{ position: 'absolute', inset: 0 }}
        onDiagnostics={(issues) => {
          if (!issues.some((i) => i.message.startsWith('Surface has no measurable area'))) release();
          if (issues.length) console.warn('[cinematic] ' + JSON.stringify(issues));
        }}
      >
        {elements.map((el, i) => {
          const cell = cells[i];
          if (!cell) return null;
          const z = DEPTH_Z[el.depth] * u;
          const c = compensation(z, P);
          const e = entrance(frame, land[i], fps);
          const state = partState(el, patchAt[i] ?? [], frame, fps);
          return (
            <Surface
              key={partId(i)}
              id={partId(i)}
              style={{
                position: 'absolute',
                left: width / 2 + cell.cx - cell.w / 2,
                top: height / 2 + cell.cy - cell.h / 2,
                width: cell.w,
                height: cell.h,
              }}
              transform={{
                x: (c - 1) * cell.cx,
                y: (c - 1) * cell.cy,
                z: z - ENTER_DEPTH * u * (1 - e),
                scale: c,
              }}
            >
              {/* Explicit size: Surface's inner wrappers are preserve-3d, which
                  makes them the containing block for anything absolute inside. */}
              <div
                style={{
                  width: cell.w,
                  height: cell.h,
                  opacity: clamp01(e * 1.8),
                  filter: softness(cell, z - ENTER_DEPTH * u * (1 - e), c),
                }}
              >
                {el.kind === 'html' ? (
                  <HtmlPart
                    html={el.html ?? ''}
                    w={cell.w}
                    h={cell.h}
                    theme={theme}
                    scale={htmlScale}
                    partClass={`cn-p${i}`}
                    onSize={(w, h) => onMeasure(i, w, h)}
                  />
                ) : isDrawn(el) ? (
                  <DrawnSlot state={state} cell={cell} scale={(boxes[i]?.scale ?? 1) * u} enter={e} theme={theme} seed={i} frame={frame} />
                ) : (
                  <PartBody el={state.now} cell={cell} progress={e} u={u} theme={theme} displayFont={displayFont} />
                )}
              </div>
            </Surface>
          );
        })}
      </FluteScene>

      {kicker || heading ? (
        <HeadingLine
          kicker={kicker}
          heading={heading}
          headFs={headFs}
          smallFs={smallFs}
          top={top}
          intro={cinematicProgress(clamp01((frame - (land[0] ?? 0) + Math.round(fps * 0.6)) / Math.round(fps * 0.7)))}
          opacity={headIn * (1 - clamp01((P / Math.max(1, P + cam.z) / (P / Math.max(1, P + rest.z)) - 1) / 0.35))}
          u={u}
          width={width}
          height={height}
          theme={theme}
          displayFont={displayFont}
          edit={edit}
        />
      ) : null}

      <LinkLayer
        links={slot.links ?? []}
        ends={linkEnds(elements, cells, boxes, land, frame, fps, u, P, cam)}
        landAt={new Map(elements.map((el, i) => [el.id, land[i]]))}
        cam={cam}
        P={P}
        u={u}
        frame={frame}
        fps={fps}
        width={width}
        height={height}
        theme={theme}
      />
    </AbsoluteFill>
  );
};

/**
 * The heading, in SCREEN space: the scene opens on it large and centred (the
 * question the diagram answers), it glides to one small line at the top as
 * the first part arrives, and it gets out of the way — fades — whenever the
 * camera is in close on a part. In the 3D scene it sat alone for the opening
 * seconds and was cropped by every push.
 */
const HeadingLine: React.FC<{
  kicker: string;
  heading: string;
  headFs: number;
  smallFs: number;
  top: number;
  /** 0 = the big opening title, 1 = settled at the top. */
  intro: number;
  opacity: number;
  u: number;
  width: number;
  height: number;
  theme: Theme;
  displayFont: string;
  edit: ReturnType<typeof useEdit>;
}> = ({ kicker, heading, headFs, smallFs, top, intro, opacity, u, width, height, theme, displayFont, edit }) => {
  const big = headFs * 1.2;
  const fs = big + (smallFs - big) * intro;
  const bigTop = height * 0.42 - big * 0.6;
  const y = bigTop + (top - bigTop) * intro;
  if (opacity <= 0.01) return null;
  return (
    <div style={{ position: 'absolute', left: width * 0.07, width: width * 0.86, top: y, textAlign: 'center', opacity }}>
      {kicker ? (
        <div
          {...edit('kicker', {
            fontFamily: MONO_FONT,
            fontSize: 22 * u,
            letterSpacing: 4 * u,
            textTransform: 'uppercase',
            color: theme.accent,
            marginBottom: 8 * u,
          })}
        >
          {edit.text('kicker', kicker)}
        </div>
      ) : null}
      {heading ? (
        <div
          {...edit('heading', {
            fontFamily: displayFont,
            fontWeight: 900,
            fontSize: fs,
            lineHeight: 1.12,
            color: theme.text,
          })}
        >
          {edit.text('heading', heading)}
        </div>
      ) : null}
    </div>
  );
};

/** Everything the link layer needs to know about each part at this frame. */
const linkEnds = (
  elements: CinematicElement[],
  cells: Cell[],
  boxes: ({ w: number; h: number } | null)[],
  land: number[],
  frame: number,
  fps: number,
  u: number,
  P: number,
  cam: ReturnType<ReturnType<typeof cameraPath>>
): Map<string, LinkEnd> => {
  const ends = new Map<string, LinkEnd>();
  elements.forEach((el, i) => {
    const cell = cells[i];
    const box = boxes[i];
    if (!cell || !box) return;
    const zFinal = DEPTH_Z[el.depth] * u;
    const e = entrance(frame, land[i], fps);
    const z = zFinal - ENTER_DEPTH * u * (1 - e);
    ends.set(el.id, {
      cell,
      box,
      z,
      c: compensation(zFinal, P),
      enter: e,
      blur: blurShare(cam, cell, z, P, { fStop: FOCUS.fStop, focalLength: FOCUS.focalLength * u }),
    });
  });
  return ends;
};

/** A drawn part at its natural size, scaled to fit and centred in its cell. */
const DrawnSlot: React.FC<{
  state: ReturnType<typeof partState>;
  cell: Cell;
  scale: number;
  enter: number;
  theme: Theme;
  seed: number;
  frame: number;
}> = ({ state, cell, scale, enter, theme, seed, frame }) => (
  <div style={{ width: cell.w, height: cell.h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ flex: 'none', transform: `scale(${scale})`, transformOrigin: 'center center' }}>
      <DrawnPart el={state.now} before={state.before} t={state.t} enter={enter} theme={theme} seed={seed} frame={frame} />
    </div>
  </div>
);

/** One part, centred in its cell, sized to fit it. */
const PartBody: React.FC<{
  el: CinematicElement;
  cell: Cell;
  progress: number;
  u: number;
  theme: Theme;
  displayFont: string;
}> = ({ el, cell, progress, u, theme, displayFont }) => {
  const { w, h } = cell;
  const sub = (el.sub ?? '').trim();
  const subFs = 25 * u;
  const subH = sub ? subFs * 1.3 * 2 + 12 * u : 0;
  const box: React.CSSProperties = {
    width: w,
    height: h,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: 12 * u,
  };
  const subLine = sub ? (
    <div
      style={{
        fontFamily: BODY_FONT,
        fontSize: subFs,
        lineHeight: 1.3,
        color: theme.muted,
        maxWidth: w * 0.92,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}
    >
      {sub}
    </div>
  ) : null;

  switch (el.kind) {
    case 'stat': {
      const text = (el.text ?? '').trim();
      const fs = fitText(text, {
        width: w * 0.9,
        max: Math.min(124 * u, (h - subH) * 0.7),
        min: 30 * u,
        maxLines: 1,
        font: displayFont,
        weight: 900,
      });
      return (
        <div style={box}>
          <div style={{ fontFamily: displayFont, fontWeight: 900, fontSize: fs, lineHeight: 1, color: theme.accent }}>
            {text}
          </div>
          {subLine}
        </div>
      );
    }
    case 'formula': {
      const expr = (el.formula ?? el.text ?? '').trim();
      const units = Math.max(4, mathWidthUnits(parseMath(expr)));
      const stacked = /frac\{|sqrt\{/.test(expr);
      const fs = Math.max(
        24 * u,
        Math.min(90 * u, (h - subH) * (stacked ? 0.34 : 0.5), (w * 0.9) / (units * 0.6))
      );
      return (
        <div style={box}>
          <MathText
            expr={expr}
            color={theme.text}
            barColor={theme.accent}
            style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: fs, justifyContent: 'center' }}
          />
          {subLine}
        </div>
      );
    }
    case 'icon': {
      const label = (el.text ?? '').trim();
      const size = Math.min(h * 0.5, w * 0.45, 180 * u);
      const labelFs = label
        ? fitText(label, { width: w * 0.9, max: 42 * u, min: 22 * u, maxLines: 2, font: displayFont, weight: 900 })
        : 0;
      return (
        <div style={box}>
          <IconStroke name={el.icon} progress={progress} size={size} color={theme.accent} strokeWidth={1.8} />
          {label ? (
            <div style={{ fontFamily: displayFont, fontWeight: 900, fontSize: labelFs, lineHeight: 1.1, color: theme.text }}>
              {label}
            </div>
          ) : null}
          {subLine}
        </div>
      );
    }
    case 'html':
      // Drawn parts render through HtmlPart in the card itself (they are
      // measured and share one scale); never through here.
      return null;
    case 'text':
    default: {
      const text = (el.text ?? '').trim();
      const short = text.length <= 32;
      const font = short ? displayFont : BODY_FONT;
      const weight = short ? 900 : 500;
      const cap = (short ? 78 : 44) * u;
      // Try one line, then two, ... and keep the biggest size that fits both
      // the width (fitText) and the cell's height.
      let fs = 20 * u;
      for (let lines = 1; lines <= (short ? 2 : 4); lines++) {
        const size = fitText(text, {
          width: w * 0.9,
          max: Math.min(cap, ((h - subH) * 0.85) / (lines * 1.18)),
          min: 18 * u,
          maxLines: lines,
          font,
          weight,
        });
        fs = Math.max(fs, size);
      }
      return (
        <div style={box}>
          <div
            style={{
              fontFamily: font,
              fontWeight: weight,
              fontSize: fs,
              lineHeight: 1.15,
              color: theme.text,
              maxWidth: w * 0.92,
            }}
          >
            {text}
          </div>
          {subLine}
        </div>
      );
    }
  }
};

/**
 * A part the MODEL designed: its own markup and css, mounted as-is (already
 * sanitised by Support\CustomHtml). It sizes itself — `max-content` up to the
 * reference width — and is measured once (ResizeObserver; Remotion mounts
 * before it sizes, so a one-shot measure reads 0) and reported up, so the
 * card can give every drawn part one shared scale and anchor links to it.
 *
 * What it is given is TOKENS, never components: the palette (including a
 * "bad" red and two soft fills, since gradients and shadows are stripped) and
 * the three font stacks.
 */
const HtmlPart: React.FC<{
  html: string;
  w: number;
  h: number;
  theme: Theme;
  /** The card-wide scale, once every drawn part is measured. */
  scale: number | null;
  partClass: string;
  onSize: (w: number, h: number) => void;
}> = ({ html, w, h, theme, scale, partClass, onSize }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const nw = el.offsetWidth;
      const nh = el.offsetHeight;
      if (nw > 0 && nh > 0) {
        setNatural((prev) => (prev && prev.w === nw && prev.h === nh ? prev : { w: nw, h: nh }));
        onSize(nw, nh);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s =
    scale ?? (natural ? Math.min((w * 0.9) / natural.w, (h * 0.92) / natural.h, 1.3) : 1);

  return (
    <div style={{ width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        className={`cc-scope ${partClass}`}
        style={{
          flex: 'none',
          transform: `scale(${s})`,
          transformOrigin: 'center center',
          ['--accent' as string]: theme.accent,
          ['--accent2' as string]: theme.accent2,
          ['--accent-soft' as string]: alpha(theme.accent, 0.14),
          ['--bad' as string]: BAD,
          ['--bad-soft' as string]: alpha(BAD, 0.14),
          ['--text' as string]: theme.text,
          ['--muted' as string]: theme.muted,
          ['--panel' as string]: theme.panel,
          ['--panel-2' as string]: hairline(theme, 0.05),
          ['--bg' as string]: theme.bg_from,
          ['--line' as string]: hairline(theme, 0.14),
          ['--font-display' as string]: DISPLAY_FONT,
          ['--font-body' as string]: BODY_FONT,
          ['--font-mono' as string]: MONO_FONT,
        }}
      >
        <div
          ref={ref}
          style={{ width: 'max-content', maxWidth: HTML_REFERENCE_W }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
};
