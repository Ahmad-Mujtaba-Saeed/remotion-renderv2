import { Theme, DEFAULT_THEME } from '../types';
import { luminance } from '../theme';

/**
 * Colours a transition's leading edge / seam. The accent is the intended
 * look, but a hairline only exists if it contrasts with the fields it rides
 * over — when the accent sits too close to the scene background in luminance
 * (e.g. a gold accent sweeping across a gold-adjacent field), fall back to
 * whichever of ink(text)/paper reads. Same contrast-picking idea as the
 * canvas seamColor precedent.
 */
export interface SeamColors {
  accent: string;
  ink: string;
  paper: string;
  /** The resolved edge-line colour (accent unless it fails contrast). */
  edge: string;
}

export const seamColors = (theme?: Theme | null): SeamColors => {
  const t = theme ?? DEFAULT_THEME;
  const bgLum = luminance(t.bg_from);
  const accentContrast = Math.abs(luminance(t.accent) - bgLum);
  const edge = accentContrast >= 0.1 ? t.accent : t.text;
  return { accent: t.accent, ink: t.text, paper: t.bg_from, edge };
};
