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
 * The cinematic canvas journey, v3 "isolated islands": every scene is a
 * borderless composition region somewhere in a huge world, but scenes DON'T
 * share the screen — only the scene the camera is on (plus, mid-flight, the
 * one it is leaving) is visible. Neighbours fade in as the camera flies
 * toward them and the departed scene dissolves behind us, so each stop feels
 * like its own place rather than a station on a visible map. Nested scenes
 * (zoom_nest) keep their parent visible as surrounding context, and the
 * journey ENDS on the final scene — there is no closing overview.
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

  const itemByScene = useMemo(() => new Map(plan.items.map((item) => [item.scene_id, item])), [plan.items]);

  // Ancestor chains (zoom_nest parents), as scene indices.
  const ancestors = useMemo(() => {
    const indexById = new Map(scenes.map((s, i) => [s.scene_id, i]));
    return scenes.map((scene) => {
      const chain: number[] = [];
      let cur = itemByScene.get(scene.scene_id)?.parent_id ?? null;
      let guard = 0;
      while (cur && guard++ < 12) {
        const idx = indexById.get(cur);
        if (idx === undefined) break;
        chain.push(idx);
        cur = itemByScene.get(cur)?.parent_id ?? null;
      }
      return chain;
    });
  }, [scenes, itemByScene]);

  if (!scenes.length) return null;

  const cam = camera.at(frame);

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const smooth = (v: number) => {
    const t = clamp01(v);
    return t * t * (3 - 2 * t);
  };

  // ---- Scene isolation ------------------------------------------------------
  // Per-frame visibility: the active scene is on; during a flight the arriving
  // scene fades in early and the departing one dissolves late; everyone else
  // simply does not exist. Nested descendants of the active scene stay visible
  // (they ARE part of its picture) and ancestors are always at least as
  // visible as their children (you dive INTO them, so they surround you).
  let active = camera.windows.length - 1;
  for (let k = 0; k < camera.windows.length; k++) {
    if (frame < camera.windows[k].start + camera.windows[k].frames) {
      active = k;
      break;
    }
  }
  const aw = camera.windows[active];
  const local = frame - aw.start;
  const inTravel = active > 0 && local < aw.travel;

  const alphas = new Array<number>(scenes.length).fill(0);
  if (inTravel) {
    const t = local / Math.max(1, aw.travel);
    const arriving = itemByScene.get(scenes[active].scene_id);
    // A nested scene was already visible as a picture-in-picture before the
    // dive — never re-fade it. Top-level arrivals materialise over the first
    // third of the flight.
    alphas[active] = arriving?.parent_id ? 1 : smooth(t / 0.32);

    const relation = arriving?.relation ?? 'continues';
    // Contrast beats hold the departing scene longer (the comparison is the
    // point); everything else lets go just past mid-flight.
    const fadeStart = relation === 'contrast' ? 0.72 : 0.55;
    const leaving = 1 - smooth((t - fadeStart) / (1 - fadeStart));
    alphas[active - 1] = Math.max(alphas[active - 1], leaving);

    // Callback flights draw their line from an EARLIER scene — that endpoint
    // fades in with the line and dissolves with the departure.
    const conn = plan.connectors[active - 1];
    if (conn && conn.from !== scenes[active - 1].scene_id) {
      const fromIdx = scenes.findIndex((s) => s.scene_id === conn.from);
      if (fromIdx >= 0) {
        alphas[fromIdx] = Math.max(alphas[fromIdx], Math.min(leaving, smooth(t / 0.32)));
      }
    }
  } else {
    alphas[active] = 1;
  }

  // Descendants of the active scene stay visible (nest previews; LOD gates
  // how early they actually read), then ancestors inherit their children's
  // visibility so a nested hold always keeps its surrounding parent.
  for (let j = 0; j < scenes.length; j++) {
    if (j !== active && ancestors[j].includes(active)) {
      alphas[j] = Math.max(alphas[j], alphas[active]);
    }
  }
  for (let j = 0; j < scenes.length; j++) {
    if (alphas[j] <= 0) continue;
    for (const anc of ancestors[j]) {
      alphas[anc] = Math.max(alphas[anc], alphas[j]);
    }
  }

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

        {/* Guide lines, drawn beneath the regions. A connector only exists
            around its own flight: it draws ahead of the camera, then fades
            away shortly after touchdown — no breadcrumb map accumulates. */}
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
            const w = camera.windows[i + 1];
            if (!from || !to || !w) return null;

            const linger = Math.round(fps * 0.45);
            const fadeLen = Math.round(fps * 0.6);
            const fadeAt = w.start + w.travel + linger;
            if (frame < w.start || frame > fadeAt + fadeLen) return null;
            const opacity = frame <= fadeAt ? 1 : 1 - (frame - fadeAt) / fadeLen;

            return (
              <Connector
                key={`${conn.from}->${conn.to}`}
                from={from}
                to={to}
                hopIndex={i}
                progress={camera.travelProgressEased(i + 1, frame)}
                opacity={opacity}
                label={conn.label}
                style={conn.style === 'arrow' || conn.style === 'curve' || conn.style === 'straight' ? 'arrow' : 'dotted'}
              />
            );
          })}
        </svg>

        {/* Scene regions (parents first, nested children above them). */}
        {renderOrder.map(({ scene, i, item }) => {
          const w = camera.windows[i];
          const next = camera.windows[i + 1];
          return (
            <SceneRegion
              key={scene.scene_id}
              item={item!}
              scene={scene}
              focus={camera.focus(i, frame)}
              lod={lodFor(item!.w)}
              alpha={alphas[i]}
              clock={{
                // Content starts revealing just before touchdown so the region
                // is alive the moment the camera lands. The cold open (scene 1)
                // starts immediately — the camera IS already inside it, and a
                // frameless region with unrevealed content is a blank screen.
                start: w.start + (i === 0 ? 0 : Math.round(w.travel * 0.55)),
                end: w.start + w.frames,
                // Full on-screen life of the region (flight in -> faded out
                // during the next flight); slot videos only mount inside it.
                mediaFrom: Math.max(0, w.start - Math.round(fps * 0.2)),
                mediaUntil: next
                  ? next.start + next.travel + Math.round(fps * 0.5)
                  : w.start + w.frames,
              }}
            />
          );
        })}

        {/* AI props scatter above the regions (screen-blended cut-outs).
            They live and die with their scene's visibility. */}
        {renderOrder.flatMap(({ i, item }) =>
          (item!.props ?? []).map((prop, p) => (
            <PropSprite
              key={`${item!.scene_id}-prop-${p}`}
              prop={prop}
              item={item!}
              appearFrame={camera.windows[i].start + Math.round(camera.windows[i].travel * 0.7)}
              alpha={alphas[i]}
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
