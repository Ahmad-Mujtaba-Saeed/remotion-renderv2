import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { Theme, DEFAULT_THEME } from './types';
import { ThemeProvider, DISPLAY_FONT, MONO_FONT, inkOn, hairline } from './theme';
import { FontLoader } from './fonts';

export interface ThumbnailProps {
  title?: string;
  kicker?: string;
  theme?: Theme | null;
  /** Hero image (an uploaded slot asset or a scene illustration). */
  hero_url?: string | null;
  font_pack?: string | null;
  width?: number;
  height?: number;
}

/**
 * ThumbnailComp (copilot.md §10.5): the still rendered AFTER the video —
 * giant title over the flat field, accent bars, optional hero image block.
 * Same theme/fonts as the video so the thumbnail and the content read as one
 * piece. renderStill'd at 1280×720 and 1080×1920 by the /thumbnail endpoint.
 */
export const ThumbnailComp: React.FC<ThumbnailProps> = ({
  title = '',
  kicker = '',
  theme,
  hero_url,
  font_pack,
  width = 1280,
  height = 720,
}) => {
  const t = theme ?? DEFAULT_THEME;
  const portrait = height > width;
  const u = Math.min(width, height) / 720;
  const words = title.trim().split(/\s+/).filter(Boolean);
  // Giant type: scale down as the title grows so 3 lines always fit.
  const size = (portrait ? 92 : 104) * u * (words.length > 8 ? 0.72 : words.length > 5 ? 0.86 : 1);

  return (
    <ThemeProvider theme={t}>
      <AbsoluteFill
        style={{
          background: t.bg_from,
          flexDirection: portrait ? 'column' : 'row',
          overflow: 'hidden',
        }}
      >
        <FontLoader pack={font_pack ?? undefined} />

        {/* Copy block. */}
        <div
          style={{
            flex: 1.1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: `${64 * u}px ${72 * u}px`,
            boxSizing: 'border-box',
            minWidth: 0,
          }}
        >
          {/* Accent bars — the design's signature mark, oversized. */}
          <div style={{ display: 'flex', gap: 12 * u, marginBottom: 36 * u }}>
            <div style={{ width: 84 * u, height: 14 * u, background: t.accent }} />
            <div style={{ width: 30 * u, height: 14 * u, background: t.accent2 }} />
          </div>
          {kicker ? (
            <div
              style={{
                fontFamily: MONO_FONT,
                fontSize: 26 * u,
                fontWeight: 700,
                letterSpacing: 5 * u,
                textTransform: 'uppercase',
                color: t.accent,
                marginBottom: 22 * u,
              }}
            >
              {kicker}
            </div>
          ) : null}
          <h1
            style={{
              margin: 0,
              fontFamily: DISPLAY_FONT,
              fontWeight: 900,
              fontSize: size,
              lineHeight: 1.02,
              letterSpacing: -1 * u,
              color: t.text,
              overflowWrap: 'break-word',
            }}
          >
            {title}
          </h1>
        </div>

        {/* Hero block: image on an accent-offset plinth, or a flat accent
            field with the ink dot when there is no image. */}
        <div
          style={{
            flex: 0.9,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 48 * u,
            boxSizing: 'border-box',
          }}
        >
          {hero_url ? (
            <div style={{ position: 'relative', width: '100%', height: '78%' }}>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: `translate(${18 * u}px, ${18 * u}px)`,
                  background: t.accent,
                }}
              />
              <Img
                src={hero_url}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  border: `1px solid ${hairline(t, 0.25)}`,
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                height: '70%',
                background: t.accent,
                display: 'flex',
                alignItems: 'flex-end',
                padding: 34 * u,
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  width: 46 * u,
                  height: 46 * u,
                  borderRadius: '50%',
                  background: inkOn(t.accent),
                }}
              />
            </div>
          )}
        </div>
      </AbsoluteFill>
    </ThemeProvider>
  );
};
