import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { ShotList } from '../types';
import { useTheme } from '../theme';
import { AmbientBackground } from '../components/AmbientBackground';
import { normalizePlan } from './autoLayout';
import { buildCamera } from './camera';
import { Connector } from './Connector';
import { StationCard } from './StationCard';

/**
 * The cinematic canvas journey: every scene is a framed station card on ONE
 * huge world canvas; a virtual camera opens tight on station 1, pulls back to
 * reveal the canvas, then flies hop by hop along self-drawing arrows — pushing
 * into each station while its narration plays — and closes on a pull-back
 * overview of the entire journey.
 */
export const CanvasJourney: React.FC<{ shotList: ShotList }> = ({ shotList }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, width: vw, height: vh } = useVideoConfig();

  const scenes = useMemo(
    () => [...(shotList.scenes ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [shotList.scenes]
  );

  const plan = useMemo(
    () => normalizePlan(shotList.canvas, scenes, shotList.aspect_ratio),
    [shotList.canvas, scenes, shotList.aspect_ratio]
  );

  const camera = useMemo(() => buildCamera(plan, scenes, fps, vw, vh), [plan, scenes, fps, vw, vh]);

  if (!scenes.length) return null;

  const cam = camera.at(frame);
  const itemByScene = new Map(plan.items.map((item) => [item.scene_id, item]));

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {/* Living backdrop stays in viewport space (doesn't fly with the world). */}
      <AmbientBackground />

      {/* Parallax texture: a faint dot grid shifting at a fraction of camera
          speed sells the depth between backdrop and canvas. */}
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(rgba(255,255,255,0.09) 2.5px, transparent 2.5px)`,
          backgroundSize: '130px 130px',
          backgroundPosition: `${-cam.x * cam.scale * 0.22}px ${-cam.y * cam.scale * 0.22}px`,
          opacity: 0.6,
        }}
      />

      {/* THE WORLD — one camera transform moves everything. */}
      <div
        style={{
          position: 'absolute',
          width: plan.world.width,
          height: plan.world.height,
          transform: `translate(${vw / 2 - cam.x * cam.scale}px, ${vh / 2 - cam.y * cam.scale}px) scale(${cam.scale})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {/* Full-speed dot grid pinned to the world itself. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `radial-gradient(rgba(255,255,255,0.13) 3px, transparent 3px)`,
            backgroundSize: '170px 170px',
            opacity: 0.5,
          }}
        />

        {/* Journey arrows, drawn beneath the cards. */}
        <svg
          width={plan.world.width}
          height={plan.world.height}
          viewBox={`0 0 ${plan.world.width} ${plan.world.height}`}
          style={{ position: 'absolute', inset: 0 }}
        >
          {plan.connectors.map((conn, i) => {
            const from = itemByScene.get(conn.from);
            const to = itemByScene.get(conn.to);
            if (!from || !to) return null;
            return (
              <Connector
                key={`${conn.from}->${conn.to}`}
                from={from}
                to={to}
                hopIndex={i}
                progress={camera.travelProgress(i + 1, frame)}
                label={conn.label}
                straight={conn.style === 'straight'}
              />
            );
          })}
        </svg>

        {/* Station cards. */}
        {scenes.map((scene, i) => {
          const item = itemByScene.get(scene.scene_id);
          if (!item) return null;
          const w = camera.windows[i];
          return (
            <StationCard
              key={scene.scene_id}
              item={item}
              scene={scene}
              index={i}
              focus={camera.focus(i, frame)}
              clock={{
                // Content starts revealing just before touchdown so the card
                // is alive the moment the camera lands.
                start: w.start + Math.round(w.travel * 0.55),
                end: w.start + w.frames,
              }}
            />
          );
        })}
      </div>

      {/* Per-scene narration, timed to each station's window. */}
      {scenes.map((scene, i) =>
        scene.narration_audio_url ? (
          <Sequence
            key={`n-${scene.scene_id}`}
            from={camera.windows[i].start}
            durationInFrames={camera.windows[i].frames}
          >
            <Audio src={scene.narration_audio_url} />
          </Sequence>
        ) : null
      )}

      {/* Gentle edge vignette keeps the eye centred during flights. */}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background: `radial-gradient(ellipse at center, transparent 58%, ${theme.bg_from}99 130%)`,
        }}
      />
    </AbsoluteFill>
  );
};
