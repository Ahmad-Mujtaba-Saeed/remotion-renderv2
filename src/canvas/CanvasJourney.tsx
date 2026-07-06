import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { ShotList } from '../types';
import { useTheme } from '../theme';
import { AmbientBackground } from '../components/AmbientBackground';
import { normalizePlan } from './autoLayout';
import { buildCamera } from './camera';
import { Connector } from './Connector';
import { SceneRegion } from './SceneRegion';
import { PropSprite } from './PropSprite';

/**
 * The cinematic canvas journey, v2 "frameless soft collage": every scene is a
 * borderless composition region on ONE huge world canvas — media with big
 * soft-rounded masks, text floating straight on the background, AI-generated
 * props drifting around. The camera opens tight on scene 1, then hops, dives
 * (zoom_nest — the next scene physically lives inside the previous visual)
 * and pulls wide (pull_reveal) between regions, closing on an overview of the
 * whole journey. Guide lines are subtle dotted breadcrumbs by default; bold
 * arrows only where the director asked for one.
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

  // Level of detail: how large a region currently appears on screen (as a
  // fraction of the viewport width). Deeply nested scenes stay hidden until
  // the camera is close enough for them to read as a picture-in-picture.
  const lodFor = (w: number): number => {
    const frac = (w * cam.scale) / vw;
    return Math.max(0, Math.min(1, (frac - 0.03) / 0.05));
  };

  // Parents render beneath their nested children.
  const renderOrder = scenes
    .map((scene, i) => ({ scene, i, item: itemByScene.get(scene.scene_id) }))
    .filter((e) => e.item)
    .sort((a, b) => (a.item!.depth ?? 0) - (b.item!.depth ?? 0) || a.i - b.i);

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

      {/* Camera roll: the world rotates a few degrees around the viewport
          center mid-flight and always lands level — a banked-turn feel. */}
      <AbsoluteFill style={{ transform: `rotate(${cam.rot}deg)`, willChange: 'transform' }}>
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

        {/* Guide lines, drawn beneath the regions. */}
        <svg
          width={plan.world.width}
          height={plan.world.height}
          viewBox={`0 0 ${plan.world.width} ${plan.world.height}`}
          style={{ position: 'absolute', inset: 0 }}
        >
          {plan.connectors.map((conn, i) => {
            if (conn.style === 'none') return null;
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
                style={conn.style === 'arrow' || conn.style === 'curve' || conn.style === 'straight' ? 'arrow' : 'dotted'}
              />
            );
          })}
        </svg>

        {/* Scene regions (parents first, nested children above them). */}
        {renderOrder.map(({ scene, i, item }) => {
          const w = camera.windows[i];
          return (
            <SceneRegion
              key={scene.scene_id}
              item={item!}
              scene={scene}
              focus={camera.focus(i, frame)}
              lod={lodFor(item!.w)}
              clock={{
                // Content starts revealing just before touchdown so the region
                // is alive the moment the camera lands.
                start: w.start + Math.round(w.travel * 0.55),
                end: w.start + w.frames,
              }}
            />
          );
        })}

        {/* AI props scatter above the regions (screen-blended cut-outs). */}
        {renderOrder.flatMap(({ i, item }) =>
          (item!.props ?? []).map((prop, p) => (
            <PropSprite
              key={`${item!.scene_id}-prop-${p}`}
              prop={prop}
              item={item!}
              appearFrame={camera.windows[i].start + Math.round(camera.windows[i].travel * 0.7)}
              seed={i * 7 + p + 1}
            />
          ))
        )}
      </div>
      </AbsoluteFill>

      {/* Per-scene narration, timed to each region's window. Boosted above
          the music bed so the voice always leads the mix. */}
      {scenes.map((scene, i) =>
        scene.narration_audio_url ? (
          <Sequence
            key={`n-${scene.scene_id}`}
            from={camera.windows[i].start}
            durationInFrames={camera.windows[i].frames}
          >
            <Audio src={scene.narration_audio_url} volume={1.3} />
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
