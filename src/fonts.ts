import { continueRender, delayRender, staticFile } from 'remotion';
import type { FC } from 'react';
import { useEffect, useState } from 'react';

/**
 * Self-hosted webfonts, organised as FONT PACKS (copilot.md §4.7):
 *
 *   - editorial (default): Bricolage Grotesque / Instrument Sans / Space Mono
 *     — the type system from the redesign reference.
 *   - classic:   Fraunces (serif display) / Instrument Sans / Space Mono
 *     — documentary/history feel.
 *   - tech:      Space Grotesk / Inter / JetBrains Mono
 *     — technical/data-heavy feel.
 *
 * The three roles are exposed under stable ALIAS family names ("Explainer
 * Display" etc.), and the active pack decides which woff2 files those aliases
 * resolve to. That keeps every component's font stack (theme.tsx) untouched
 * when the pack changes — the swap happens entirely in @font-face.
 *
 * Self-hosted, not fetched from Google Fonts: the render host has no reliable
 * internet guarantee, and a network font fetch during render is exactly the
 * kind of non-determinism (FOUT / hung request) to avoid. Licenses are OFL —
 * see FONTS_LICENSES.md. Faces are registered TWO ways for robustness:
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

export const DISPLAY_FONT_FAMILY = 'Explainer Display';
export const BODY_FONT_FAMILY = 'Explainer Body';
export const MONO_FONT_FAMILY = 'Explainer Mono';

export type FontPackName = 'editorial' | 'classic' | 'tech';

interface FontFace {
  family: string;
  file: string;
  weight: string;
}

const PACKS: Record<FontPackName, FontFace[]> = {
  editorial: [
    { family: DISPLAY_FONT_FAMILY, file: 'bricolage-grotesque.woff2', weight: '600 800' },
    { family: BODY_FONT_FAMILY, file: 'instrument-sans.woff2', weight: '400 600' },
    { family: MONO_FONT_FAMILY, file: 'space-mono-regular.woff2', weight: '400' },
    { family: MONO_FONT_FAMILY, file: 'space-mono-bold.woff2', weight: '700' },
  ],
  classic: [
    { family: DISPLAY_FONT_FAMILY, file: 'fraunces.woff2', weight: '600 800' },
    { family: BODY_FONT_FAMILY, file: 'instrument-sans.woff2', weight: '400 600' },
    { family: MONO_FONT_FAMILY, file: 'space-mono-regular.woff2', weight: '400' },
    { family: MONO_FONT_FAMILY, file: 'space-mono-bold.woff2', weight: '700' },
  ],
  tech: [
    { family: DISPLAY_FONT_FAMILY, file: 'space-grotesk.woff2', weight: '500 700' },
    { family: BODY_FONT_FAMILY, file: 'inter.woff2', weight: '400 600' },
    { family: MONO_FONT_FAMILY, file: 'jetbrains-mono-regular.woff2', weight: '400' },
    { family: MONO_FONT_FAMILY, file: 'jetbrains-mono-bold.woff2', weight: '700' },
  ],
};

/** Laravel resolves 'auto' before it ships; anything unknown = editorial. */
export const normalizeFontPack = (pack?: string | null): FontPackName =>
  pack === 'classic' || pack === 'tech' ? pack : 'editorial';

let cssInjectedFor: FontPackName | null = null;

/** Declare the faces via CSS once per pack, replacing any previous pack's
 *  declarations (one composition = one pack; preview may switch). */
const injectFontFaceCss = (pack: FontPackName): void => {
  if (cssInjectedFor === pack || typeof document === 'undefined') return;
  cssInjectedFor = pack;
  try {
    const css = PACKS[pack]
      .map(
        ({ family, file, weight }) =>
          `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
          `font-display:swap;src:url(${staticFile(`fonts/${file}`)}) format('woff2');}`
      )
      .join('\n');
    let styleEl = document.querySelector('style[data-explainer-fonts]') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.setAttribute('data-explainer-fonts', 'true');
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  } catch {
    // Non-fatal — the explicit load below (and the fallback stacks) cover us.
  }
};

/**
 * Blocks frame capture until the active pack's faces are ready. Mount ONCE,
 * high in the tree, passing the shot list's font_pack. The delayRender handle
 * is created in the render lifecycle (not at module scope) so
 * `continueRender` reliably clears it.
 */
export const FontLoader: FC<{ pack?: string | null }> = ({ pack }) => {
  const active = normalizeFontPack(pack);
  injectFontFaceCss(active);

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
      PACKS[active].map(({ family, weight }) =>
        fontSet.load(`${weight.split(' ')[0]} 16px '${family}'`).catch((err) => {
          console.warn(`[fonts] failed to load ${family} ${weight}:`, err);
        })
      )
    ).finally(() => {
      clearTimeout(safety);
      finish();
    });

    return () => clearTimeout(safety);
  }, [handle, active]);

  return null;
};
