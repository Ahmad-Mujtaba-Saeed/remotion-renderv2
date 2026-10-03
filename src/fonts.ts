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

/**
 * Maths glyph fallback. The bundled faces are LATIN-ONLY subsets: none of them
 * carries π, θ, Δ, √, ≤, ∞, →, ℒ, ∫ or ∑. Those glyphs have only ever survived
 * because Chromium silently fell through to a host font — which means the maths
 * has been rendering in whatever the render machine happened to install, and
 * would land as tofu boxes on a host with no symbol font (a Linux render
 * container).
 *
 * Appending this to every maths font stack makes that fallback explicit and
 * ordered: Cambria Math and Segoe UI Symbol both ship with Windows and both
 * cover the full operator/greek range; DejaVu Sans is the usual Linux
 * equivalent; `serif` is the last resort.
 *
 * NOTE: this is a font STACK, not a bundled file — a render host with none of
 * these installed still shows tofu. Bundling a subset of a math face is the
 * permanent fix if rendering ever moves off Windows.
 */
export const MATH_GLYPH_FALLBACK = `'Cambria Math', 'Segoe UI Symbol', 'DejaVu Sans', 'STIX Two Math', serif`;

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

/**
 * The unique look's font LIBRARY (registry `style_recipe.fonts`, v53): any
 * display × body × mono trio Laravel draws for a project. Keys mirror the
 * registry exactly — that block is the contract, this table is its executable
 * twin. Variable faces declare their whole weight axis in one file; the
 * static monos ship a regular and a bold.
 */
const LIB: Record<string, Array<{ file: string; weight: string }>> = {
  // display (and some bodies)
  'bricolage-grotesque': [{ file: 'bricolage-grotesque.woff2', weight: '600 800' }],
  fraunces: [{ file: 'fraunces.woff2', weight: '600 800' }],
  'space-grotesk': [{ file: 'space-grotesk.woff2', weight: '500 700' }],
  manrope: [{ file: 'manrope.woff2', weight: '200 800' }],
  sora: [{ file: 'sora.woff2', weight: '100 800' }],
  outfit: [{ file: 'outfit.woff2', weight: '100 900' }],
  'plus-jakarta-sans': [{ file: 'plus-jakarta-sans.woff2', weight: '200 800' }],
  syne: [{ file: 'syne.woff2', weight: '400 800' }],
  unbounded: [{ file: 'unbounded.woff2', weight: '200 900' }],
  archivo: [{ file: 'archivo.woff2', weight: '100 900' }],
  epilogue: [{ file: 'epilogue.woff2', weight: '100 900' }],
  'red-hat-display': [{ file: 'red-hat-display.woff2', weight: '300 900' }],
  lexend: [{ file: 'lexend.woff2', weight: '100 900' }],
  'playfair-display': [{ file: 'playfair-display.woff2', weight: '400 900' }],
  newsreader: [{ file: 'newsreader.woff2', weight: '200 800' }],
  'big-shoulders-display': [{ file: 'big-shoulders-display.woff2', weight: '100 900' }],
  'schibsted-grotesk': [{ file: 'schibsted-grotesk.woff2', weight: '400 900' }],
  'familjen-grotesk': [{ file: 'familjen-grotesk.woff2', weight: '400 700' }],
  figtree: [{ file: 'figtree.woff2', weight: '300 900' }],
  onest: [{ file: 'onest.woff2', weight: '100 900' }],
  'hanken-grotesk': [{ file: 'hanken-grotesk.woff2', weight: '100 900' }],
  urbanist: [{ file: 'urbanist.woff2', weight: '100 900' }],
  bitter: [{ file: 'bitter.woff2', weight: '100 900' }],
  'roboto-slab': [{ file: 'roboto-slab.woff2', weight: '100 900' }],
  'josefin-sans': [{ file: 'josefin-sans.woff2', weight: '100 700' }],
  oswald: [{ file: 'oswald.woff2', weight: '200 700' }],
  literata: [{ file: 'literata.woff2', weight: '200 900' }],
  // body
  'instrument-sans': [{ file: 'instrument-sans.woff2', weight: '400 600' }],
  inter: [{ file: 'inter.woff2', weight: '400 600' }],
  'dm-sans': [{ file: 'dm-sans.woff2', weight: '100 1000' }],
  'work-sans': [{ file: 'work-sans.woff2', weight: '100 900' }],
  'public-sans': [{ file: 'public-sans.woff2', weight: '100 900' }],
  'source-sans-3': [{ file: 'source-sans-3.woff2', weight: '200 900' }],
  'nunito-sans': [{ file: 'nunito-sans.woff2', weight: '200 1000' }],
  karla: [{ file: 'karla.woff2', weight: '200 800' }],
  'ibm-plex-sans': [{ file: 'ibm-plex-sans.woff2', weight: '100 700' }],
  'albert-sans': [{ file: 'albert-sans.woff2', weight: '100 900' }],
  // mono
  'space-mono': [
    { file: 'space-mono-regular.woff2', weight: '400' },
    { file: 'space-mono-bold.woff2', weight: '700' },
  ],
  'jetbrains-mono': [
    { file: 'jetbrains-mono-regular.woff2', weight: '400' },
    { file: 'jetbrains-mono-bold.woff2', weight: '700' },
  ],
  'ibm-plex-mono': [
    { file: 'ibm-plex-mono-regular.woff2', weight: '400' },
    { file: 'ibm-plex-mono-bold.woff2', weight: '700' },
  ],
  'fira-code': [{ file: 'fira-code.woff2', weight: '300 700' }],
  'roboto-mono': [{ file: 'roboto-mono.woff2', weight: '100 700' }],
  'martian-mono': [{ file: 'martian-mono.woff2', weight: '100 800' }],
  'source-code-pro': [{ file: 'source-code-pro.woff2', weight: '200 900' }],
  'red-hat-mono': [{ file: 'red-hat-mono.woff2', weight: '300 700' }],
  'geist-mono': [{ file: 'geist-mono.woff2', weight: '100 900' }],
};

/** Every library key and its files — exported for the probe that checks each file ships. */
export const FONT_LIBRARY_FILES: Record<string, string[]> = Object.fromEntries(
  Object.entries(LIB).map(([k, v]) => [k, v.map((f) => f.file)])
);

export interface FontTrio {
  display?: string | null;
  body?: string | null;
  mono?: string | null;
}

/**
 * The faces to declare: the unique look's trio when every key resolves, the
 * pack otherwise (a half-known trio would mix two looks — all or nothing).
 */
const facesFor = (pack: FontPackName, trio?: FontTrio | null): FontFace[] => {
  const d = trio?.display ? LIB[trio.display] : undefined;
  const b = trio?.body ? LIB[trio.body] : undefined;
  const m = trio?.mono ? LIB[trio.mono] : undefined;
  if (!d || !b || !m) return PACKS[pack];
  return [
    ...d.map((f) => ({ family: DISPLAY_FONT_FAMILY, ...f })),
    ...b.map((f) => ({ family: BODY_FONT_FAMILY, ...f })),
    ...m.map((f) => ({ family: MONO_FONT_FAMILY, ...f })),
  ];
};

let cssInjectedFor: string | null = null;

/** Declare the faces via CSS once per face set, replacing any previous set's
 *  declarations (one composition = one set; preview may switch). */
const injectFontFaceCss = (faces: FontFace[]): void => {
  const key = faces.map((f) => `${f.family}:${f.file}`).join('|');
  if (cssInjectedFor === key || typeof document === 'undefined') return;
  cssInjectedFor = key;
  try {
    const css = faces
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
export const FontLoader: FC<{ pack?: string | null; fonts?: FontTrio | null }> = ({ pack, fonts }) => {
  const faces = facesFor(normalizeFontPack(pack), fonts);
  const facesKey = faces.map((f) => f.file).join('|');
  injectFontFaceCss(faces);

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
      faces.map(({ family, weight }) =>
        fontSet.load(`${weight.split(' ')[0]} 16px '${family}'`).catch((err) => {
          console.warn(`[fonts] failed to load ${family} ${weight}:`, err);
        })
      )
    ).finally(() => {
      clearTimeout(safety);
      finish();
    });

    return () => clearTimeout(safety);
    // `faces` is derived from the key — re-running on the key is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, facesKey]);

  return null;
};
