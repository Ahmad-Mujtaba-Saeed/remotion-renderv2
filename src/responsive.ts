import { useVideoConfig } from 'remotion';

/**
 * Aspect-aware sizing. All component styles were originally designed against a
 * 1920x1080 frame with absolute px values, which broke 9:16 renders (fonts and
 * paddings far too large for a 1080-wide portrait frame). Every px design
 * value is now multiplied by this unit, which is 1 at 1080p landscape, 1 at
 * 1080x1920 portrait (same short side), and scales linearly with resolution.
 */
export const useScaleUnit = (): number => {
  const { width, height } = useVideoConfig();
  return Math.min(width, height) / 1080;
};

export const useIsPortrait = (): boolean => {
  const { width, height } = useVideoConfig();
  return height > width;
};
