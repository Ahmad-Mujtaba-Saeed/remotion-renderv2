import React, { createContext, useContext } from 'react';
import { Theme, DEFAULT_THEME } from './types';
import { DISPLAY_FONT_FAMILY, BODY_FONT_FAMILY, MONO_FONT_FAMILY } from './fonts';

const ThemeContext = createContext<Theme>(DEFAULT_THEME);

export const ThemeProvider: React.FC<{ theme?: Theme; children: React.ReactNode }> = ({
  theme,
  children,
}) => <ThemeContext.Provider value={theme ?? DEFAULT_THEME}>{children}</ThemeContext.Provider>;

export const useTheme = (): Theme => useContext(ThemeContext);

/**
 * The editorial type system: one confident display face (headings,
 * punchlines, big numerals), one clean body face, one mono face for
 * kickers/labels/UI numerals. Self-hosted (see fonts.ts) so the render stays
 * fully deterministic — no network fetch mid-render — while still getting a
 * real, designed typeface instead of a system-font substitute.
 */
export const DISPLAY_FONT = `'${DISPLAY_FONT_FAMILY}', 'Segoe UI', system-ui, sans-serif`;
export const BODY_FONT = `'${BODY_FONT_FAMILY}', 'Segoe UI', system-ui, sans-serif`;
export const MONO_FONT = `'${MONO_FONT_FAMILY}', 'Consolas', 'Courier New', monospace`;

/** Kept for existing call sites — the display face is now consistent across
 *  every theme (a real display face doesn't need per-theme substitution). */
export const useDisplayFont = (): string => DISPLAY_FONT;

// ---------------------------------------------------------------------------
// Light/dark surface kit
//
// Most components paint their subtle raised surfaces + hairlines with
// `rgba(255,255,255, α)` — a lift toward white that only reads on a DARK
// background. To support light themes (the cream/ink "Sunrise" scheme) those
// literals now go through these helpers, which flip to an ink-toned tint when
// the theme's own background is light. For every existing (dark) theme the
// helpers return the identical `rgba(255,255,255, α)`, so those renders are
// byte-for-byte unchanged; only a light theme diverges.
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

/**
 * A subtle contrasting tint for raised surfaces (pills, chips, plates): lifts
 * toward white on dark themes, deepens toward ink on light themes.
 */
export const raise = (theme: Theme, alpha: number): string =>
  `rgba(${isLightTheme(theme) ? INK : PAPER},${alpha})`;

/** A hairline border/divider tint, theme-aware (same rule as {@link raise}). */
export const hairline = (theme: Theme, alpha: number): string =>
  `rgba(${isLightTheme(theme) ? INK : PAPER},${alpha})`;

/**
 * The most readable ink (near-black or near-white) to place ON an arbitrary
 * solid background color — used for text on the accent-coloured punch card so
 * it stays legible whatever the accent is. Crossover ~0.18 (WCAG black/white
 * equal-contrast point).
 */
export const inkOn = (bg: string): string => (luminance(bg) > 0.18 ? '#17120E' : '#FBF7F0');
