import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { useTheme, isLightTheme } from '../theme';

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/**
 * A whisper of edge darkening. Enough to stop the corners competing with the
 * copy, far too little to read as a "vignette effect".
 */
export const Vignette: React.FC = () => {
  const theme = useTheme();
  const edge = isLightTheme(theme) ? 'rgba(40,30,20,0.05)' : 'rgba(0,0,0,0.16)';
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(130% 130% at 50% 45%, transparent 68%, ${edge} 100%)`,
        pointerEvents: 'none',
      }}
    />
  );
};

/**
 * The field a scene sits on: ONE flat colour.
 *
 * It used to be a diagonal gradient with two drifting accent glows, orbiting
 * motion graphics, a vignette and film grain — five moving decorations behind
 * copy that is already moving. Now the background is a colour and nothing else,
 * so the type, the rules and the camera are the only things asking for
 * attention.
 *
 * `imageUrl` is the slides-mode AI ambient backdrop; it keeps its blur because
 * it lives in screen space, never inside the camera-scaled world.
 */
export const AmbientBackground: React.FC<{ imageUrl?: string }> = ({ imageUrl }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: theme.bg_from }}>
      {imageUrl ? (
        <>
          <AbsoluteFill>
            <Img
              src={imageUrl}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'blur(26px) brightness(0.4) saturate(0.9)',
                transform: `scale(${lerp(1.12, 1.2, p)})`,
              }}
            />
          </AbsoluteFill>
          <Vignette />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
