import React from 'react';
import { Theme } from '../types';
import { useTheme, hairline, useSkin, Skin } from '../theme';

/**
 * The one surface in the design: a flat colour block with a hairline edge,
 * flavoured by the active SKIN (§11.2):
 *
 *  - flat:    opaque panel colour (the house look);
 *  - outline: transparent field, a real 1px hairline border — technical;
 *  - print:   transparent field, rules above and below instead of a border —
 *             the editorial footnote block.
 *
 * Used only where copy sits on top of media and needs a field of its own
 * (the docked banner, the side panel). Everywhere else, text goes straight
 * onto the scene's colour.
 *
 * NB: over MEDIA a fully transparent panel would be illegible, so the
 * outline/print skins keep a solid scrim underlay at high opacity via
 * `surfaceStyle(theme, skin, overMedia)`.
 *
 * This replaces the old frosted-glass card. `backdrop-filter` was both an
 * aesthetic mismatch and a real bug: any filter inside the camera-scaled
 * canvas world makes Chromium rasterize the subtree, and the text lands
 * blurry.
 */
export const surfaceStyle = (theme: Theme, skin: Skin = 'flat', overMedia = true): React.CSSProperties => {
  if (skin === 'outline' && !overMedia) {
    return { background: 'transparent', border: `1px solid ${hairline(theme, 0.28)}` };
  }
  if (skin === 'print' && !overMedia) {
    return {
      background: 'transparent',
      borderTop: `2px solid ${hairline(theme, 0.3)}`,
      borderBottom: `1px solid ${hairline(theme, 0.18)}`,
    };
  }
  // flat — and the legibility fallback for any skin over media: outline keeps
  // its stronger border, print its rules, both on the opaque panel field.
  const base: React.CSSProperties = {
    background: theme.panel,
    border: `1px solid ${hairline(theme, skin === 'outline' ? 0.28 : 0.09)}`,
  };
  if (skin === 'print') {
    base.border = undefined;
    base.borderTop = `2px solid ${hairline(theme, 0.3)}`;
    base.borderBottom = `1px solid ${hairline(theme, 0.18)}`;
  }
  return base;
};

/** The current skin's surface, for call sites inside components. */
export const useSurfaceStyle = (overMedia = true): React.CSSProperties => {
  const theme = useTheme();
  const skin = useSkin();
  return surfaceStyle(theme, skin, overMedia);
};

export const PanelSurface: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => {
  const theme = useTheme();
  const skin = useSkin();
  return <div style={{ ...surfaceStyle(theme, skin), ...style }}>{children}</div>;
};
