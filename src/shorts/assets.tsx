import React, { useEffect, useState } from 'react';
import { Audio, Sequence, continueRender, delayRender, staticFile, useVideoConfig } from 'remotion';
import type { CaptionStyle } from './types';

/**
 * Fonts and sounds for the ViralShort composition.
 *
 * Unlike the explainer (one font pack per video, behind role aliases), a batch
 * of shorts deliberately mixes faces, so each face is registered under its own
 * family name and a style picks one. All files are the self-hosted OFL faces
 * already bundled in public/fonts.
 */

const FACES: { family: string; file: string; weight: string }[] = [
  { family: 'Short Bricolage', file: 'bricolage-grotesque.woff2', weight: '200 800' },
  { family: 'Short Fraunces', file: 'fraunces.woff2', weight: '100 900' },
  { family: 'Short Grotesk', file: 'space-grotesk.woff2', weight: '300 700' },
  { family: 'Short Inter', file: 'inter.woff2', weight: '100 900' },
  { family: 'Short Mono', file: 'jetbrains-mono-bold.woff2', weight: '700' },
  { family: 'Short Mono', file: 'jetbrains-mono-regular.woff2', weight: '400' },
];

const STACKS: Record<CaptionStyle['font'], string> = {
  bricolage: `'Short Bricolage', 'Arial Black', sans-serif`,
  fraunces: `'Short Fraunces', Georgia, serif`,
  grotesk: `'Short Grotesk', 'Segoe UI', sans-serif`,
  inter: `'Short Inter', 'Segoe UI', Arial, sans-serif`,
  mono: `'Short Mono', Consolas, monospace`,
  // The classic meme face where the host has it; the chunkiest bundled face otherwise.
  impact: `Impact, 'Haettenschweiler', 'Arial Narrow Bold', 'Short Bricolage', sans-serif`,
};

// Emoji need a colour-emoji face; list the common ones for each OS.
export const EMOJI_STACK = `'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`;

export const fontStack = (font: CaptionStyle['font']): string => `${STACKS[font] ?? STACKS.inter}, ${EMOJI_STACK}`;

let injected = false;
const inject = () => {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const css = FACES.map(
    (f) =>
      `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:normal;font-display:block;` +
      `src:url(${staticFile(`fonts/${f.file}`)}) format('woff2');}`
  ).join('\n');
  const el = document.createElement('style');
  el.setAttribute('data-short-fonts', 'true');
  el.textContent = css;
  document.head.appendChild(el);
};

export const ShortFontLoader: React.FC = () => {
  inject();
  const [handle] = useState(() =>
    typeof document !== 'undefined' && (document as unknown as { fonts?: unknown }).fonts
      ? delayRender('Loading short fonts', { timeoutInMilliseconds: 20000 })
      : null
  );
  useEffect(() => {
    if (handle === null) return;
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        continueRender(handle);
      }
    };
    const safety = setTimeout(finish, 8000);
    Promise.all(
      FACES.map((f) => document.fonts.load(`${f.weight.split(' ').pop()} 40px '${f.family}'`).catch(() => null))
    ).finally(() => {
      clearTimeout(safety);
      finish();
    });
    return () => clearTimeout(safety);
  }, [handle]);
  return null;
};

/** Meme SFX (scripts/gen-meme-sfx.ts). name -> seconds. */
export const MEME_SFX: Record<string, number> = {
  boom: 1.5,
  bass_drop: 1.8,
  record_scratch: 0.62,
  ding: 1.2,
  pop: 0.16,
  boing: 0.8,
  glitch: 0.55,
  whoosh_fast: 0.38,
  shutter: 0.26,
  heartbeat: 0.95,
  riser: 1.4,
  wrong: 0.75,
  swipe: 0.3,
  tada: 1.1,
  snare: 0.4,
  cash: 0.9,
};

/** Explainer library sounds that also suit shorts. */
const EXPLAINER_SFX: Record<string, number> = {
  whoosh_soft: 1.1,
  whoosh_impact: 1.0,
  sub_boom: 0.9,
  pop_a: 0.3,
  pop_b: 0.3,
  chime: 0.9,
  stamp: 0.7,
};

export const sfxSrc = (name: string): { src: string; seconds: number } | null => {
  if (MEME_SFX[name]) return { src: staticFile(`sfx/meme/${name}.wav`), seconds: MEME_SFX[name] };
  if (EXPLAINER_SFX[name]) return { src: staticFile(`sfx/${name}.wav`), seconds: EXPLAINER_SFX[name] };
  return null;
};

export const ShortSfx: React.FC<{ name: string; at: number; volume: number }> = ({ name, at, volume }) => {
  const { fps } = useVideoConfig();
  const s = sfxSrc(name);
  if (!s) return null;
  return (
    <Sequence from={Math.max(0, Math.round(at * fps))} durationInFrames={Math.ceil(s.seconds * fps) + 2} layout="none">
      <Audio src={s.src} volume={Math.max(0, Math.min(1.5, volume))} />
    </Sequence>
  );
};
