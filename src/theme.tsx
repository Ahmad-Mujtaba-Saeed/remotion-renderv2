import React, { createContext, useContext } from 'react';
import { Theme, DEFAULT_THEME } from './types';

const ThemeContext = createContext<Theme>(DEFAULT_THEME);

export const ThemeProvider: React.FC<{ theme?: Theme; children: React.ReactNode }> = ({
  theme,
  children,
}) => <ThemeContext.Provider value={theme ?? DEFAULT_THEME}>{children}</ThemeContext.Provider>;

export const useTheme = (): Theme => useContext(ThemeContext);

/** Cheap stable string hash (shared by the per-theme font pick). */
const hashStr = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/**
 * Display-font stacks with different personalities. The render host is the
 * Windows machine running the Node server, so every family here is either a
 * stock Windows face or degrades to one — no webfont fetch, no FOUT, text
 * stays deterministic frame to frame. Body copy stays on the neutral stack;
 * only display type (headings, punchlines, big numerals) takes a personality.
 */
const DISPLAY_STACKS = [
  "Inter, 'Segoe UI', system-ui, sans-serif",
  "'Bahnschrift', 'Segoe UI Semibold', Inter, system-ui, sans-serif",
  "'Segoe UI Black', 'Segoe UI', Inter, system-ui, sans-serif",
];

export const BODY_FONT = "Inter, 'Segoe UI', system-ui, sans-serif";

/** The theme's display stack — stable per color scheme, varied across them. */
export const useDisplayFont = (): string => {
  const theme = useTheme();
  return DISPLAY_STACKS[hashStr(theme.name || 'midnight') % DISPLAY_STACKS.length];
};
