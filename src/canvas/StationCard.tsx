import React from 'react';
import { useVideoConfig } from 'remotion';
import { CanvasItem, Scene } from '../types';
import { useTheme } from '../theme';
import { SceneLayout } from '../components/SceneRouter';
import { SceneClockProvider, SceneClockWindow } from './SceneClock';

/**
 * One scene pinned onto the world canvas as a framed "station" card.
 *
 * The card's content is the scene's REGULAR layout (split, full-bleed, ...)
 * rendered at the composition's design resolution and uniformly scaled down
 * to fit inside the frame — so every layout, theme token and responsive fix
 * works identically in slides mode and on the canvas.
 *
 * `focus` (0..1, from the camera track) drives the cinematic state: focused
 * cards glow and run at full brightness, unfocused ones sit dimmed on the map.
 */
export const StationCard: React.FC<{
  item: CanvasItem;
  scene: Scene;
  index: number;
  focus: number;
  clock: SceneClockWindow;
}> = ({ item, scene, index, focus, clock }) => {
  const theme = useTheme();
  const { width: designW, height: designH } = useVideoConfig();

  const framePad = Math.round(Math.min(item.w, item.h) * 0.018);
  const innerW = item.w - framePad * 2;
  const innerH = item.h - framePad * 2;

  // Content is designed at the viewport's width, with the height that keeps
  // the card's own aspect — then scaled uniformly into the frame.
  const scale = innerW / designW;
  const contentH = innerH / scale;

  const hero = item.emphasis === 'hero';
  const badge = Math.round(Math.max(56, Math.min(item.w, item.h) * 0.085));

  return (
    <div
      style={{
        position: 'absolute',
        left: item.x - item.w / 2,
        top: item.y - item.h / 2,
        width: item.w,
        height: item.h,
        transform: `rotate(${item.rotation ?? 0}deg)`,
        transformOrigin: 'center center',
      }}
    >
      {/* Frame */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 34,
          padding: framePad,
          boxSizing: 'border-box',
          background: theme.panel,
          border: `${hero ? 3 : 2}px solid rgba(255,255,255,${0.14 + 0.3 * focus})`,
          boxShadow: [
            '0 30px 90px rgba(0,0,0,0.5)',
            `0 0 ${Math.round(160 * focus)}px ${theme.accent}${focus > 0.05 ? '55' : '00'}`,
            hero ? `0 0 0 ${framePad}px ${theme.accent}22` : '',
          ]
            .filter(Boolean)
            .join(', '),
          filter: `brightness(${0.66 + 0.34 * focus}) saturate(${0.78 + 0.22 * focus})`,
        }}
      >
        <div style={{ width: '100%', height: '100%', borderRadius: Math.max(10, 34 - framePad), overflow: 'hidden' }}>
          <div
            style={{
              width: designW,
              height: contentH,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              position: 'relative',
              background: `linear-gradient(135deg, ${theme.bg_from}, ${theme.bg_to})`,
            }}
          >
            <SceneClockProvider window={clock}>
              <SceneLayout scene={scene} />
            </SceneClockProvider>
          </div>
        </div>
      </div>

      {/* Station number badge */}
      <div
        style={{
          position: 'absolute',
          left: -badge * 0.35,
          top: -badge * 0.35,
          width: badge,
          height: badge,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
          color: '#0b1020',
          fontSize: badge * 0.48,
          fontWeight: 900,
          fontFamily: 'Inter, system-ui, sans-serif',
          boxShadow: `0 10px 30px rgba(0,0,0,0.45), 0 0 ${Math.round(40 * focus)}px ${theme.accent}66`,
          border: '3px solid rgba(255,255,255,0.35)',
        }}
      >
        {index + 1}
      </div>
    </div>
  );
};
