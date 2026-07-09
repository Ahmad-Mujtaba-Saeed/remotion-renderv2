import React from 'react';
import { Theme } from '../types';
import { useTheme, hairline } from '../theme';

/**
 * Frosted-glass surface style (glassmorphism): translucent fill, backdrop blur,
 * a hairline border and a soft inner top highlight. Shared by the explanation
 * box and the floating panels/banners. The border/highlight are theme-aware so
 * the card stays defined on a light (cream) theme, where a white edge vanishes.
 */
export const glassStyle = (theme: Theme, radius = 26): React.CSSProperties => ({
  background: theme.panel,
  backdropFilter: 'blur(16px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
  border: `1px solid ${hairline(theme, 0.16)}`,
  borderRadius: radius,
  boxShadow: `0 24px 70px rgba(0,0,0,0.45), inset 0 1px 0 ${hairline(theme, 0.22)}`,
});

export const GlassCard: React.FC<{
  children: React.ReactNode;
  radius?: number;
  style?: React.CSSProperties;
}> = ({ children, radius = 26, style }) => {
  const theme = useTheme();
  return <div style={{ ...glassStyle(theme, radius), ...style }}>{children}</div>;
};
