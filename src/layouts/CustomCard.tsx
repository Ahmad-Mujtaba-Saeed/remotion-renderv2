import React, { useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, useVideoConfig, delayRender, continueRender } from 'remotion';
import { Scene } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT, BODY_FONT, DISPLAY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01 } from '../motion/easing';
import { useCardReveal } from '../motion/cardReveal';
import { spokenAt } from '../motion/narrationBeats';

/**
 * custom_card — the escape hatch.
 *
 * Every other layout in this directory draws a fixed shape. This one mounts a
 * fragment the PLANNER authored: a boarding pass, a chat thread, a scoreboard,
 * a nutrition label — the one beat per video that no card in the registry can
 * express. The fragment arrives already sanitised by `Support\CustomHtml` on
 * the PHP side, and is deliberately NOT re-checked here: two implementations
 * of "what is safe" that can disagree is worse than one that runs early.
 *
 * Three things this component owns, because the fragment is not allowed to:
 *
 * **The palette and the type.** Theme colours and the video's font stacks are
 * injected as CSS variables on the scope element. A fragment referencing
 * var(--accent) is in the video's colour scheme automatically, and a fragment
 * that hardcodes #ff0000 looks wrong on purpose.
 *
 * **The timing.** CSS animations and transitions are stripped by the
 * sanitiser, because a fragment animating itself runs on wall-clock time and
 * Remotion renders frame by frame — it would come out frozen or juddering.
 * Instead the fragment marks elements with `data-at` (a 0..1 point in the
 * scene) or `data-word` (land when the narrator says that word), optionally
 * with `data-anim`, and THIS component emits the per-frame CSS for those cues
 * off the scene clock and the active motion style.
 *
 * **The fit.** The fragment is authored against a 1000px-wide reference
 * canvas and scaled to the stage, so it never depends on the render size, and
 * it is measured once and scaled DOWN further if it is too tall. Without that
 * a fragment two lines too long would simply be cut off at the frame edge.
 */

/** Distinct values of one data attribute, in document order. */
const cueValues = (html: string, attribute: string): string[] => {
  const out: string[] = [];
  const re = new RegExp(`${attribute}="([^"]*)"`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
};

export const CustomCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_custom'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();
  const reveal = useCardReveal();

  const innerRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  // Same measuring subtlety as CalloutLayer: Remotion mounts the tree before
  // it sizes the composition container, so a one-shot layout-effect measure
  // reads 0x0 forever. The observer catches the real size; the delayRender
  // handle holds the frame capture until it has; the timeout means a fragment
  // that somehow never lays out cannot hold a render hostage.
  const [handle] = useState(() => delayRender('CustomCard measure'));
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) {
      continueRender(handle);
      return;
    }
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        continueRender(handle);
      }
    };
    const measure = () => {
      const w = el.scrollWidth;
      const h = el.scrollHeight;
      if (w > 0 && h > 0) {
        setNatural((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
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

  if (!slot) return null;
  const html = (slot.html ?? '').trim();
  if (html === '') return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const kicker = (meta.style?.kicker ?? '').trim();

  const headFs = heading
    ? fitText(heading, {
        width: width * (portrait ? 0.86 : 0.76),
        max: 50 * u,
        min: 26 * u,
        maxLines: 2,
        font: displayFont,
        weight: 900,
      })
    : 0;
  const headIn = reveal.ease(clamp01(frame / reveal.headFrames));
  const headZone = (kicker ? 36 * u : 0) + (heading ? headFs * 1.2 : 0) + (kicker || heading ? 24 * u : 0);
  const capZone = caption ? 46 * u : 0;

  // ---- The stage, and the reference canvas inside it ------------------------
  const stageW = width * 0.88;
  const stageH = height * 0.84 - headZone - capZone;
  const REFERENCE_W = 1000;
  const fitScale = natural
    ? Math.min(stageW / REFERENCE_W, stageH / Math.max(1, natural.h), 1.6)
    : stageW / REFERENCE_W;

  // ---- Reveal cues ----------------------------------------------------------
  const words = scene.narration_words ?? [];
  const atCues = cueValues(html, 'data-at');
  const wordCues = cueValues(html, 'data-word');

  /** Landed progress 0..1 for a cue that fires at frame `at`. */
  const progressAt = (at: number): number =>
    reveal.ease(clamp01((frame - at) / Math.max(1, reveal.popFrames)));

  const sceneFrames = Math.max(1, Math.round((scene.duration_seconds ?? 6) * fps));

  /** The CSS for one cue value, for every animation style. */
  const cueRules = (selector: string, p: number): string => {
    const rise = reveal.rise * 2;
    const dim = (v: number) => Number(v.toFixed(4));
    const base = `opacity: ${dim(p)}; transform: translateY(${dim((1 - p) * rise)}px);`;
    return [
      `.cc-scope ${selector} { ${base} }`,
      `.cc-scope ${selector}[data-anim="none"] { opacity: 1; transform: none; }`,
      `.cc-scope ${selector}[data-anim="fade"] { opacity: ${dim(p)}; transform: none; }`,
      `.cc-scope ${selector}[data-anim="rise"] { ${base} }`,
      `.cc-scope ${selector}[data-anim="pop"] { opacity: ${dim(p)}; transform: scale(${dim(0.88 + 0.12 * p + reveal.overshoot * p * (1 - p) * 4)}); }`,
      `.cc-scope ${selector}[data-anim="slide"] { opacity: ${dim(p)}; transform: translateX(${dim((1 - p) * -rise * 2)}px); }`,
      `.cc-scope ${selector}[data-anim="grow"] { opacity: ${dim(p)}; transform: scaleX(${dim(0.2 + 0.8 * p)}); transform-origin: left center; }`,
    ].join('\n');
  };

  const revealCss: string[] = [];
  for (const cue of atCues) {
    const fraction = clamp01(parseFloat(cue));
    if (!isFinite(fraction)) continue;
    revealCss.push(cueRules(`[data-at="${cue}"]`, progressAt(Math.round(fraction * sceneFrames))));
  }
  // Word cues are emitted AFTER the fraction cues so that an element carrying
  // both lands on the spoken word — the narration is the more precise cue, and
  // equal specificity means the later rule wins.
  for (const cue of wordCues) {
    // A word that is never spoken must not hide its element forever: with no
    // match the cue falls back to the motion style's own opening beat.
    const at = spokenAt(words, cue, fps) ?? reveal.first;
    revealCss.push(cueRules(`[data-word="${cue}"]`, progressAt(at)));
  }

  // ---- Base styling the fragment inherits ----------------------------------
  const baseCss = `
.cc-scope { color: ${theme.text}; font-family: ${BODY_FONT}; font-size: 30px; line-height: 1.35; }
.cc-scope * { box-sizing: border-box; }
.cc-scope h1, .cc-scope h2, .cc-scope h3, .cc-scope h4 { font-family: ${DISPLAY_FONT}; font-weight: 900; margin: 0 0 12px; line-height: 1.1; }
.cc-scope h1 { font-size: 64px; } .cc-scope h2 { font-size: 52px; } .cc-scope h3 { font-size: 42px; } .cc-scope h4 { font-size: 34px; }
.cc-scope p, .cc-scope ul, .cc-scope ol, .cc-scope table { margin: 0 0 12px; }
.cc-scope ul, .cc-scope ol { padding-left: 28px; }
.cc-scope code, .cc-scope pre, .cc-scope kbd, .cc-scope samp { font-family: ${MONO_FONT}; }
.cc-scope table { border-collapse: collapse; width: 100%; }
.cc-scope th, .cc-scope td { border: 1px solid ${hairline(theme, 0.28)}; padding: 10px 14px; text-align: left; }
.cc-scope th { font-family: ${MONO_FONT}; text-transform: uppercase; letter-spacing: 2px; font-size: 22px; color: ${theme.muted}; font-weight: 700; }
.cc-scope hr { border: 0; border-top: 1px solid ${hairline(theme, 0.28)}; margin: 16px 0; }
.cc-scope svg { display: block; max-width: 100%; }
.cc-scope [data-at], .cc-scope [data-word] { opacity: 0; }
`;

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '4%', boxSizing: 'border-box' }}>
      <style>{baseCss + (slot.css ?? '') + '\n' + revealCss.join('\n')}</style>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {(kicker || heading) && (
          <div style={{ textAlign: 'center', marginBottom: 24 * u, opacity: headIn }}>
            {kicker ? (
              <div
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 24 * u,
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
              <div
                style={{
                  fontFamily: displayFont,
                  fontWeight: 900,
                  fontSize: headFs,
                  lineHeight: 1.1,
                  color: theme.text,
                  transform: `translateY(${(1 - headIn) * reveal.rise * u}px)`,
                }}
              >
                {heading}
              </div>
            ) : null}
          </div>
        )}

        {/* The stage clips; the reference canvas inside it is what the
            fragment was authored against, scaled to fit. */}
        <div
          style={{
            width: stageW,
            height: natural ? Math.min(natural.h * fitScale, stageH) : stageH,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            className="cc-scope"
            style={{
              width: REFERENCE_W,
              transform: `scale(${fitScale})`,
              transformOrigin: 'center center',
              // The palette and the type, as variables the fragment reads.
              // A fragment that uses them is in the video's scheme for free.
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
            <div ref={innerRef} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>

        {caption ? (
          <div
            style={{
              marginTop: 18 * u,
              fontFamily: MONO_FONT,
              fontSize: 22 * u,
              letterSpacing: 1.5 * u,
              color: theme.muted,
              textAlign: 'center',
              opacity: headIn,
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
