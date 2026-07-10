import React from 'react';
import { Theme } from '../types';
import { useTheme, hairline } from '../theme';

/**
 * The one surface in the design: a flat, opaque colour block with a hairline
 * edge. Used only where copy sits on top of media and needs a field of its own
 * (the docked banner, the side panel). Everywhere else, text goes straight onto
 * the scene's colour.
 *
 * This replaces the old frosted-glass card. `backdrop-filter` was both an
 * aesthetic mismatch and a real bug: any filter inside the camera-scaled canvas
 * world makes Chromium rasterize the subtree, and the text lands blurry.
 */
export const surfaceStyle = (theme: Theme): React.CSSProperties => ({
  background: theme.panel,
  border: `1px solid ${hairline(theme, 0.09)}`,
});

export const PanelSurface: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => {
  const theme = useTheme();
  return <div style={{ ...surfaceStyle(theme), ...style }}>{children}</div>;
};
