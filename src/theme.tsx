import React, { createContext, useContext } from 'react';
import { Theme, DEFAULT_THEME } from './types';
import {
  DISPLAY_FONT_FAMILY,
  BODY_FONT_FAMILY,
  MONO_FONT_FAMILY,
  MATH_GLYPH_FALLBACK,
} from './fonts';

const ThemeContext = createContext<Theme>(DEFAULT_THEME);

export const ThemeProvider: React.FC<{ theme?: Theme; children: React.ReactNode }> = ({
  theme,
  children,
}) => <ThemeContext.Provider value={theme ?? DEFAULT_THEME}>{children}</ThemeContext.Provider>;

export const useTheme = (): Theme => useContext(ThemeContext);

// ---------------------------------------------------------------------------
// Skins (copilot.md §11.2): one value that flavours every SURFACE while the
// scheme supplies the colours. `flat` is the house look (opaque panels);
// `outline` empties the panels and draws 1px hairlines instead (technical
// feel); `print` empties them too and leans on rules + the serif font pack
// (Laravel maps `font_pack: auto` to classic under this skin). No textures —
// grain is banned; the print feel comes from type and rules only.
// ---------------------------------------------------------------------------

export type Skin = 'flat' | 'outline' | 'print';

const SkinContext = createContext<Skin>('flat');

export const SkinProvider: React.FC<{ skin?: string | null; children: React.ReactNode }> = ({
  skin,
  children,
}) => (
  <SkinContext.Provider value={skin === 'outline' || skin === 'print' ? skin : 'flat'}>
    {children}
  </SkinContext.Provider>
);

export const useSkin = (): Skin => useContext(SkinContext);

/**
 * The editorial type system: one confident display face (headings,
 * punchlines, big numerals), one clean body face, one mono face for
 * kickers/labels/UI numerals. Self-hosted (see fonts.ts) so the render stays
 * fully deterministic — no network fetch mid-render — while still getting a
 * real, designed typeface instead of a system-font substitute.
 */
/* MATH_GLYPH_FALLBACK sits directly after the bundled face in every stack: the
 * bundled subsets carry no π/θ/√/≤/∞/ℒ/∫, and 'Segoe UI'/'Consolas' do not
 * carry the operator range either, so without it a maths glyph fell through to
 * whatever Chromium picked last. See fonts.ts for the full note. */
export const DISPLAY_FONT = `'${DISPLAY_FONT_FAMILY}', ${MATH_GLYPH_FALLBACK}, 'Segoe UI', system-ui, sans-serif`;
export const BODY_FONT = `'${BODY_FONT_FAMILY}', ${MATH_GLYPH_FALLBACK}, 'Segoe UI', system-ui, sans-serif`;
export const MONO_FONT = `'${MONO_FONT_FAMILY}', ${MATH_GLYPH_FALLBACK}, 'Consolas', 'Courier New', monospace`;

/** Kept for existing call sites — the display face is now consistent across
 *  every theme (a real display face doesn't need per-theme substitution). */
export const useDisplayFont = (): string => DISPLAY_FONT;

// ---------------------------------------------------------------------------
// Light/dark surface kit
//
// The design paints its dividers with `rgba(255,255,255, α)` — a lift toward
// white that only reads on a DARK background. To support light themes (the
// cream/ink "Paper", "Bone" and "Sand" schemes) those literals go through
// `hairline`, which flips to an ink-toned tint when the theme's own background
// is light.
//
// (There used to be a `raise()` twin of this for translucent raised surfaces.
// The flat design has no raised surfaces, so it went with them.)
// ---------------------------------------------------------------------------

/** Relative luminance (0..1, sRGB) of a #rrggbb color. */
export const luminance = (hex: string): number => {
  const h = hex.replace('#', '').trim();
  if (h.length < 6) return 0;
  const chan = (i: number): number => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
};

/** True when the theme reads as a light scheme (pale background). */
export const isLightTheme = (theme: Theme): boolean => luminance(theme.bg_from) > 0.5;

/** Deep ink used as the "toward-ink" tint / text on light surfaces. */
const INK = '23,18,14';
const PAPER = '255,255,255';

/** A hairline rule/divider tint: toward white on dark themes, toward ink on light. */
export const hairline = (theme: Theme, alpha: number): string =>
  `rgba(${isLightTheme(theme) ? INK : PAPER},${alpha})`;

/**
 * The most readable ink (near-black or near-white) to place ON an arbitrary
 * solid background color — used for text on the accent-coloured punch card so
 * it stays legible whatever the accent is. Crossover ~0.18 (WCAG black/white
 * equal-contrast point).
 */
export const inkOn = (bg: string): string => (luminance(bg) > 0.18 ? '#17120E' : '#FBF7F0');
