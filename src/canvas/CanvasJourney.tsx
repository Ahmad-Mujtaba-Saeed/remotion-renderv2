import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { CanvasItem, CanvasPlan, Scene } from '../types';
import { useTheme, isLightTheme } from '../theme';
import { AmbientBackground } from '../components/AmbientBackground';
import { PunchLine } from '../components/PunchLine';
import { CaptionTrack } from '../components/CaptionTrack';
import { normalizePlan } from './autoLayout';
import { buildCamera } from './camera';
import { Connector } from './Connector';
import { SceneRegion } from './SceneRegion';
import { PropSprite } from './PropSprite';
import { SceneClockProvider } from './SceneClock';
import { SfxCue, SfxName, sfxDuration } from '../sfx';

/** Which whoosh a flight deserves, from its story relation / treatment. */
const flightSound = (item: CanvasItem | undefined): { name: SfxName; volume: number } => {
  const treatment = item?.treatment ?? 'canvas_hop';
  const relation = item?.relation ?? 'continues';
  if (treatment === 'kinetic_break') return { name: 'whoosh_impact', volume: 1 };
  if (treatment === 'zoom_nest') return { name: 'whoosh_deep', volume: 1 };
  if (relation === 'consequence') return { name: 'whoosh_impact', volume: 1 };
  if (treatment === 'pull_reveal' || relation === 'new_chapter') return { name: 'whoosh_rise', volume: 0.95 };
  if (relation === 'callback') return { name: 'whoosh_rise', volume: 0.8 };
  return { name: 'whoosh_soft', volume: 0.95 };
};

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
export const CanvasJourney: React.FC<{
  /** Scenes this journey covers (the whole video, or one hybrid chapter). */
  scenes: Scene[];
  /** This journey's world plan; normalized/auto-laid-out when absent. */
  plan?: CanvasPlan | null;
  aspect?: string;
  /** Karaoke caption track (§4.4) — screen-space, like punchlines. */
  captions?: boolean;
}> = ({ scenes: scenesProp, plan: planProp, aspect, captions = false }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, width: vw, height: vh } = useVideoConfig();

  const scenes = useMemo(
    () => [...(scenesProp ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [scenesProp]
  );

  const plan = useMemo(() => normalizePlan(planProp, scenes, aspect), [planProp, scenes, aspect]);

  const camera = useMemo(() => buildCamera(plan, scenes, fps, vw, vh), [plan, scenes, fps, vw, vh]);

  const itemByScene = useMemo(() => new Map(plan.items.map((item) => [item.scene_id, item])), [plan.items]);

  if (!scenes.length) return null;

  // The world's dot grid reads as white specks on dark themes; on a light
  // (cream) theme it must be ink specks or it vanishes.
  const dotColor = (alpha: number): string =>
    isLightTheme(theme) ? `rgba(23,18,14,${alpha})` : `rgba(255,255,255,${alpha})`;

  const cam = camera.at(frame);

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const smooth = (v: number) => {
    const t = clamp01(v);
    return t * t * (3 - 2 * t);
  };

  // ---- Scene isolation ------------------------------------------------------
  // ONE scene at a time, strictly. The active scene is on; during a flight the
  // arriving scene MATERIALISES out of thin air (fade + condense) while the
  // departing one dissolves; everyone else simply does not exist. Nested
  // (zoom_nest) scenes are NEVER previewed as a small picture-in-picture
  // inside their parent — they only come into being mid-dive, and the parent
  // dissolves away underneath them as the camera closes in.
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
  // 0..1 birth progress of the arriving scene (drives its condense-in pop).
  const enters = new Array<number>(scenes.length).fill(1);

  if (inTravel) {
    const t = local / Math.max(1, aw.travel);
    const arriving = itemByScene.get(scenes[active].scene_id);
    const nested = Boolean(arriving?.parent_id);

    if (nested) {
      // The dive: the scene doesn't exist yet — it condenses into place as
      // the camera closes in on the parent's focal point.
      alphas[active] = smooth((t - 0.3) / 0.34);
      enters[active] = alphas[active];
      // The parent's picture carries most of the dive, then hands over.
      alphas[active - 1] = 1 - smooth((t - 0.62) / 0.38);
      // Deeper ancestors of the parent were already gone; leave them at 0.
    } else {
      alphas[active] = smooth(t / 0.32);
      enters[active] = alphas[active];

      const relation = arriving?.relation ?? 'continues';
      // Contrast beats hold the departing scene longer (the comparison is the
      // point); everything else lets go just past mid-flight.
      const fadeStart = relation === 'contrast' ? 0.72 : 0.55;
      const leaving = 1 - smooth((t - fadeStart) / (1 - fadeStart));
      alphas[active - 1] = Math.max(alphas[active - 1], leaving);

      // Leaving a NESTED scene: from flight altitude the departed detail is
      // microscopic, so the pull-out would read as flying over empty canvas.
      // Its ancestor chain fades back in — we pull back OUT of the picture we
      // dove into, then fly on (and it dissolves like any departing scene).
      let up = itemByScene.get(scenes[active - 1].scene_id)?.parent_id ?? null;
      let guard = 0;
      while (up && guard++ < 12) {
        const idx = scenes.findIndex((s) => s.scene_id === up);
        if (idx < 0) break;
        alphas[idx] = Math.max(alphas[idx], Math.min(leaving, smooth(t / 0.28)));
        up = itemByScene.get(up)?.parent_id ?? null;
      }

      // Callback flights draw their line from an EARLIER scene — that endpoint
      // fades in with the line and dissolves with the departure.
      const conn = plan.connectors[active - 1];
      if (conn && conn.from !== scenes[active - 1].scene_id) {
        const fromIdx = scenes.findIndex((s) => s.scene_id === conn.from);
        if (fromIdx >= 0) {
          alphas[fromIdx] = Math.max(alphas[fromIdx], Math.min(leaving, smooth(t / 0.32)));
        }
      }
    }
  } else {
    // Hold: the active scene lives alone — even a nested scene's parent stays
    // gone (the camera is so deep inside that only raw canvas surrounds it).
    alphas[active] = 1;
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
      {/* The flat colour field. Stays in viewport space (doesn't fly with the
          world). There used to be a second, parallax dot grid layered on top of
          it; one grid, pinned to the world, sells the depth on its own. */}
      <AmbientBackground />

      {/* Camera roll: the world rotates a few degrees around the viewport
          center mid-flight and always lands level — a banked-turn feel.
          NO will-change anywhere on the camera path: forcing the huge world
          into a cached compositor layer makes Chromium reuse rasters taken at
          mid-flight scales, which is exactly the "text goes blurry when the
          camera lands" bug. Un-promoted, every frame rasters at the true
          accumulated scale and DOM text stays vector-crisp. */}
      <AbsoluteFill style={{ transform: cam.rot !== 0 ? `rotate(${cam.rot}deg)` : undefined }}>
      {/* THE WORLD — one camera transform moves everything. */}
      <div
        style={{
          position: 'absolute',
          width: plan.world.width,
          height: plan.world.height,
          transform: `translate(${vw / 2 - cam.x * cam.scale}px, ${vh / 2 - cam.y * cam.scale}px) scale(${cam.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {/* Dot grid pinned to the world: the one texture in the design, and the
            only thing that tells the eye the camera is moving across a surface
            rather than cutting between scenes. Barely there on purpose. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `radial-gradient(${dotColor(0.07)} 1.6px, transparent 1.6px)`,
            backgroundSize: '190px 190px',
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
          // Nested scenes materialise mid-dive, so their content must spring
          // in earlier or the newborn region arrives as an empty plate; a
          // contrast scene must be readable DURING the shared-frame beat.
          const contentDelay = item!.parent_id ? 0.35 : item!.relation === 'contrast' ? 0.38 : 0.55;
          return (
            <SceneRegion
              key={scene.scene_id}
              item={item!}
              scene={scene}
              index={i}
              count={scenes.length}
              focus={camera.focus(i, frame)}
              lod={lodFor(item!.w)}
              alpha={alphas[i]}
              enter={enters[i]}
              clock={{
                // Content starts revealing just before touchdown so the region
                // is alive the moment the camera lands. The cold open (scene 1)
                // starts immediately — the camera IS already inside it, and a
                // frameless region with unrevealed content is a blank screen.
                start: w.start + (i === 0 ? 0 : Math.round(w.travel * contentDelay)),
                end: w.start + w.frames,
                // Narration audio plays from the scene window start — word-
                // synced overlays (punchlines) anchor here.
                narrationStart: w.start,
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

      {/* SOUND DESIGN: every flight whooshes past, flavoured by its story
          relation (dives rumble, consequences land with a thump, reveals
          rise). Stretched to ride the flight's own length; the cold open
          gets a soft glass shimmer instead. */}
      <SfxCue name="shimmer" at={2} volume={0.8} />
      {scenes.map((scene, i) => {
        if (i === 0) return null;
        const w = camera.windows[i];
        if (!w || w.travel <= 0) return null;
        const item = itemByScene.get(scene.scene_id);
        const { name, volume } = flightSound(item);
        const travelSec = w.travel / fps;
        const rate = Math.max(0.8, Math.min(1.45, sfxDuration(name) / Math.max(0.5, travelSec)));
        return (
          <React.Fragment key={`w-${scene.scene_id}`}>
            <SfxCue name={name} at={w.start} volume={volume} playbackRate={rate} />
            {/* kinetic_break lands like a cut — a stamp thump on touchdown. */}
            {(item?.treatment ?? '') === 'kinetic_break' ? (
              <SfxCue name="stamp" at={w.start + w.travel} volume={0.85} />
            ) : null}
          </React.Fragment>
        );
      })}

      {/* PUNCHLINES in screen space: outside the camera transform they stay
          pixel-crisp at any zoom. Each one gets its scene's clock so word-sync
          anchors to the narration start. */}
      {scenes.map((scene: Scene, i) => {
        if (!scene.punchline) return null;
        const w = camera.windows[i];
        return (
          <SceneClockProvider
            key={`p-${scene.scene_id}`}
            window={{ start: w.start, end: w.start + w.frames, narrationStart: w.start }}
          >
            <PunchLine scene={scene} />
          </SceneClockProvider>
        );
      })}

      {/* KARAOKE CAPTIONS in the same screen-space layer — word timestamps
          re-base to each scene's narration start exactly like punchlines. */}
      {captions
        ? scenes.map((scene: Scene, i) => {
            if (!scene.narration_words?.length) return null;
            const w = camera.windows[i];
            return (
              <SceneClockProvider
                key={`cap-${scene.scene_id}`}
                window={{ start: w.start, end: w.start + w.frames, narrationStart: w.start }}
              >
                <CaptionTrack scene={scene} />
              </SceneClockProvider>
            );
          })
        : null}

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
    </AbsoluteFill>
  );
};
