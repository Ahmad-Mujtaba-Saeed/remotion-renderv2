import React from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { Scene } from '../types';
import { SingleFocus } from '../layouts/SingleFocus';
import { SplitSideBySide } from '../layouts/SplitSideBySide';
import { SplitTopBottom } from '../layouts/SplitTopBottom';
import { FullBleedWithSidePanel } from '../layouts/FullBleedWithSidePanel';
import { FullBleedWithBanner } from '../layouts/FullBleedWithBanner';
import { AmbientBackground } from './AmbientBackground';
import { PunchLine } from './PunchLine';
import { SceneMetaProvider } from './SceneMeta';

/** A gentle scale+fade entrance so each scene's content settles in. */
const Entrance: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.7) });
  return (
    <AbsoluteFill style={{ opacity: interpolate(e, [0, 1], [0, 1]), transform: `scale(${interpolate(e, [0, 1], [0.985, 1])})` }}>
      {children}
    </AbsoluteFill>
  );
};

/** Routes a scene to its layout component. Exported for reuse by the canvas
 *  journey, which renders the same layouts miniaturised inside station cards. */
export const SceneLayout: React.FC<{ scene: Scene }> = ({ scene }) => {
  switch (scene.layout_template) {
    case 'split_side_by_side':
      return <SplitSideBySide scene={scene} />;
    case 'split_top_bottom':
      return <SplitTopBottom scene={scene} />;
    case 'full_bleed_with_side_panel':
      return <FullBleedWithSidePanel scene={scene} />;
    case 'full_bleed_with_banner':
      return <FullBleedWithBanner scene={scene} />;
    case 'single_focus':
    default:
      return <SingleFocus scene={scene} />;
  }
};

/**
 * Renders a full scene: living ambient background, then the layout content with
 * an entrance animation. The PHP validator guarantees a known layout_template.
 */
export const SceneRouter: React.FC<{ scene: Scene; index?: number; count?: number }> = ({
  scene,
  index = 0,
  count = 1,
}) => {
  return (
    <AbsoluteFill>
      <SceneMetaProvider value={{ index, count, style: scene.style }}>
        {/* Per-scene narration (self-hosted Kokoro). Plays from the scene start;
            scene durations are paced to the audio length on the PHP side. */}
        {scene.narration_audio_url ? <Audio src={scene.narration_audio_url} volume={1.3} /> : null}
        <AmbientBackground imageUrl={scene.ambient_image_url} />
        <Entrance>
          <SceneLayout scene={scene} />
        </Entrance>
        {/* Narration-synced punchline (slides mode: the Sequence clock IS the
            narration clock, so no scene-window re-basing is needed). */}
        {scene.punchline ? <PunchLine scene={scene} /> : null}
      </SceneMetaProvider>
    </AbsoluteFill>
  );
};
