import { Theme } from '../types';

/**
 * Board style variants — self-contained skins for the math board's ONE
 * surface. A chalkboard is deep green with chalk-white strokes no matter
 * which color scheme the video runs, and a notebook is ruled paper with ink;
 * that totality is the point of the variant, so chalk/notebook return a
 * FIXED palette instead of deriving from the scheme. 'slate' is the default:
 * the video's own theme, untouched (today's board). Everything downstream —
 * BoardEquation, figures, hairlines, isLightTheme — reads the ThemeProvider,
 * so swapping the theme restyles the whole board with no per-card work.
 * Still flat: solid fields, hairline rules, no texture, no vignette.
 */

export type BoardStyle = 'slate' | 'chalk' | 'notebook';

export const resolveBoardStyle = (raw?: string | null): BoardStyle =>
  raw === 'chalk' || raw === 'notebook' ? raw : 'slate';

const CHALK: Theme = {
  name: 'board-chalk',
  label: 'Chalkboard',
  bg_from: '#22463A',
  bg_to: '#22463A',
  accent: '#F5CE84',
  accent2: '#D9A66C',
  text: '#F4F1E3',
  muted: '#ADC0B0',
  panel: '#2B5347',
};

const NOTEBOOK: Theme = {
  name: 'board-notebook',
  label: 'Notebook',
  bg_from: '#F7F4EA',
  bg_to: '#F7F4EA',
  accent: '#C9432F',
  accent2: '#2F5AC9',
  text: '#22304E',
  muted: '#8C93A3',
  panel: '#FDFBF4',
};

export const boardTheme = (style: BoardStyle, base: Theme): Theme =>
  style === 'chalk' ? CHALK : style === 'notebook' ? NOTEBOOK : base;
