import { continueRender, delayRender, staticFile } from 'remotion';
import type { FC } from 'react';
import { useEffect, useState } from 'react';

/**
 * Self-hosted webfonts (Bricolage Grotesque, Instrument Sans, Space Mono) —
 * the exact editorial type system from the redesign reference. Self-hosted,
 * not fetched from Google Fonts: the render host has no reliable internet
 * guarantee, and a network font fetch during render is exactly the kind of
 * non-determinism (FOUT / hung request) to avoid. These files live in
 * public/fonts and are registered TWO ways for robustness:
 *
 *   1. an injected `@font-face` stylesheet, so the faces are declared and
 *      applied by the browser exactly like any CSS webfont; and
 *   2. an explicit `document.fonts.load()` per face inside <FontLoader>,
 *      gated behind a delayRender handle CREATED IN THE RENDER LIFECYCLE
 *      (useState initializer) so Chromium doesn't capture a frame before the
 *      glyphs are ready — a module-scope delayRender does NOT reliably clear
 *      the handle the renderer is actually waiting on.
 *
 * Font loading NEVER blocks or fails a render: a hard safety timeout always
 * clears the handle, and the CSS stacks in theme.tsx all carry a system-font
 * fallback, so a slow/missing face degrades gracefully.
 */

export const DISPLAY_FONT_FAMILY = 'Bricolage Grotesque';
export const BODY_FONT_FAMILY = 'Instrument Sans';
export const MONO_FONT_FAMILY = 'Space Mono';

const FACES: Array<{ family: string; file: string; weight: string }> = [
  { family: DISPLAY_FONT_FAMILY, file: 'bricolage-grotesque.woff2', weight: '600 800' },
  { family: BODY_FONT_FAMILY, file: 'instrument-sans.woff2', weight: '400 600' },
  { family: MONO_FONT_FAMILY, file: 'space-mono-regular.woff2', weight: '400' },
  { family: MONO_FONT_FAMILY, file: 'space-mono-bold.woff2', weight: '700' },
];

let cssInjected = false;

/** Declare the faces via CSS once, so the browser applies them like any webfont. */
const injectFontFaceCss = (): void => {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  try {
    const css = FACES.map(
      ({ family, file, weight }) =>
        `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
        `font-display:swap;src:url(${staticFile(`fonts/${file}`)}) format('woff2');}`
    ).join('\n');
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-explainer-fonts', 'true');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  } catch {
    // Non-fatal — the explicit load below (and the fallback stacks) cover us.
  }
};

/**
 * Blocks frame capture until the real faces are ready. Mount ONCE, high in the
 * tree. The delayRender handle is created in the render lifecycle (not at
 * module scope) so `continueRender` reliably clears it.
 */
export const FontLoader: FC = () => {
  injectFontFaceCss();

  const [handle] = useState(() => {
    if (typeof document === 'undefined' || typeof (document as unknown as { fonts?: unknown }).fonts === 'undefined') {
      return null;
    }
    return delayRender('Loading explainer webfonts', { timeoutInMilliseconds: 20000 });
  });

  useEffect(() => {
    if (handle === null) return;
    let cleared = false;
    const finish = (): void => {
      if (cleared) return;
      cleared = true;
      continueRender(handle);
    };
    // Hard safety net: a font hiccup must never fail the render.
    const safety = setTimeout(finish, 9000);

    const fontSet = (document as unknown as { fonts: { load: (f: string) => Promise<unknown> } }).fonts;
    Promise.all(
      FACES.map(({ family, weight }) =>
        fontSet.load(`${weight.split(' ')[0]} 16px '${family}'`).catch((err) => {
          console.warn(`[fonts] failed to load ${family} ${weight}:`, err);
        })
      )
    ).finally(() => {
      clearTimeout(safety);
      finish();
    });

    return () => clearTimeout(safety);
  }, [handle]);

  return null;
};
