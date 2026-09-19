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
  cameraPath,
  compensation,
  entrance,
  landFrames,
  layoutCells,
} from '../flute/cinematicRig';

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
  const camAt = useMemo(
    () => cameraPath(elements, cells, land, { P, u, fps, sceneFrames, frame: { width, height } }),
    [elements, cells, land, P, u, fps, sceneFrames, width, height]
  );
  const cam = camAt(Math.max(0, frame));
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
${htmlCss}`}</style>
      <FluteScene
        camera={{ x: cam.x, y: cam.y, z: cam.z, rotateX: cam.rx, rotateY: cam.ry, perspective: P }}
        focus={{ distance: Math.max(1, cam.focus), fStop: 1.4, focalLength: 200 * u, maxBlur: 9 * u * cam.blur }}
        style={{ position: 'absolute', inset: 0 }}
        onDiagnostics={(issues) => {
          if (!issues.some((i) => i.message.startsWith('Surface has no measurable area'))) release();
          if (issues.length) console.warn('[cinematic] ' + JSON.stringify(issues));
        }}
      >
        {kicker || heading ? (
          <Surface
            id="heading"
            style={{ position: 'absolute', left: width * 0.07, top, width: width * 0.86, height: headZone }}
          >
            <div style={{ width: width * 0.86, height: headZone, textAlign: 'center', opacity: headIn }}>
              {kicker ? (
                <div
                  {...edit('kicker', {
                    fontFamily: MONO_FONT,
                    fontSize: 24 * u,
                    letterSpacing: 4 * u,
                    textTransform: 'uppercase',
                    color: theme.accent,
                    marginBottom: 10 * u,
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
                    fontSize: headFs,
                    lineHeight: 1.1,
                    color: theme.text,
                    transform: `translateY(${(1 - headIn) * reveal.rise * u}px)`,
                  })}
                >
                  {edit.text('heading', heading)}
                </div>
              ) : null}
            </div>
          </Surface>
        ) : null}

        {elements.map((el, i) => {
          const cell = cells[i];
          if (!cell) return null;
          const z = DEPTH_Z[el.depth] * u;
          const c = compensation(z, P);
          const e = entrance(frame, land[i], fps);
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
              <div style={{ width: cell.w, height: cell.h, opacity: clamp01(e * 1.8) }}>
                <PartBody el={el} cell={cell} progress={e} u={u} theme={theme} displayFont={displayFont} />
              </div>
            </Surface>
          );
        })}
      </FluteScene>
    </AbsoluteFill>
  );
};

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
      return <HtmlPart html={el.html ?? ''} w={w} h={h} theme={theme} />;
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
 * An authored fragment, measured once and scaled to its cell — the
 * custom_card pattern (measure with a ResizeObserver and hold the frame with
 * delayRender; Remotion mounts before it sizes, so a one-shot measure reads 0).
 */
const HtmlPart: React.FC<{ html: string; w: number; h: number; theme: Theme }> = ({ html, w, h, theme }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [handle] = useState(() => delayRender('CinematicCard: html measure'));
  useLayoutEffect(() => {
    const el = ref.current;
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        continueRender(handle);
      }
    };
    if (!el) {
      finish();
      return;
    }
    const measure = () => {
      const nw = el.scrollWidth;
      const nh = el.scrollHeight;
      if (nw > 0 && nh > 0) {
        setNatural((prev) => (prev && prev.w === nw && prev.h === nh ? prev : { w: nw, h: nh }));
        finish();
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const t = setTimeout(finish, 1500);
    return () => {
      ro.disconnect();
      clearTimeout(t);
      finish();
    };
  }, [handle]);

  const scale = natural
    ? Math.min(w / HTML_REFERENCE_W, (h * 0.96) / Math.max(1, natural.h), 1.6)
    : w / HTML_REFERENCE_W;

  return (
    <div style={{ width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <div
        className="cc-scope"
        style={{
          width: HTML_REFERENCE_W,
          flex: 'none',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          ['--accent' as string]: theme.accent,
          ['--accent2' as string]: theme.accent2,
          ['--text' as string]: theme.text,
          ['--muted' as string]: theme.muted,
          ['--panel' as string]: theme.panel,
          ['--bg' as string]: theme.bg_from,
          ['--line' as string]: hairline(theme, 0.28),
          ['--font-display' as string]: DISPLAY_FONT,
          ['--font-body' as string]: BODY_FONT,
          ['--font-mono' as string]: MONO_FONT,
        }}
      >
        <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
};
