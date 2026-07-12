import React from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { SingleFocus } from '../layouts/SingleFocus';
import { SplitSideBySide } from '../layouts/SplitSideBySide';
import { SplitTopBottom } from '../layouts/SplitTopBottom';
import { FullBleedWithSidePanel } from '../layouts/FullBleedWithSidePanel';
import { FullBleedWithBanner } from '../layouts/FullBleedWithBanner';
import { StatSpotlight } from '../layouts/StatSpotlight';
import { QuoteCard } from '../layouts/QuoteCard';
import { OutroCard } from '../layouts/OutroCard';
import { VersusCard } from '../layouts/VersusCard';
import { AnimatedChart } from '../layouts/AnimatedChart';
import { BigCounter } from '../layouts/BigCounter';
import { ChecklistCard } from '../layouts/ChecklistCard';
import { IconGrid } from '../layouts/IconGrid';
import { ChapterCover } from '../layouts/ChapterCover';
import { TimelineCard } from '../layouts/TimelineCard';
import { StepFlow } from '../layouts/StepFlow';
import { BeforeAfter } from '../layouts/BeforeAfter';
import { ListRanking } from '../layouts/ListRanking';
import { ProgressMeter } from '../layouts/ProgressMeter';
import { QuotePortrait } from '../layouts/QuotePortrait';
import { AmbientBackground } from './AmbientBackground';
import { PunchLine } from './PunchLine';
import { CaptionTrack } from './CaptionTrack';
import { SceneMetaProvider } from './SceneMeta';
import { clamp01, easeInOutSine, easeOutCubic, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { useMotionStyle } from '../motion/styles';

/** A gentle scale+fade entrance so each scene's content settles in — paced
    by the motion style's base duration (§2.5), so a `classic` video breathes
    into every scene while `swiss` snaps. */
const Entrance: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const motion = useMotionStyle();
  const r = motion.baseF / 13;
  const p = easeOutQuint(clamp01(frame / f30(fps, Math.round(18 * r))));
  return (
    <AbsoluteFill
      style={{
        opacity: easeOutCubic(clamp01(frame / f30(fps, Math.round(12 * r)))),
        transform: `scale(${0.986 + 0.014 * p})`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/**
 * Midpoint re-frame for slides (copilot.md §2.8, Law 6: never frozen): any
 * scene held longer than 8 seconds gets a whole-frame push (1.00 → 1.035)
 * over its back half — the slides twin of the canvas camera's re-frame. The
 * envelope completes by 85% of the scene so the outgoing transition never
 * starts from a moving frame. Transform only.
 */
const MidholdPush: React.FC<{ seconds: number; children: React.ReactNode }> = ({
  seconds,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = Math.max(1, Math.round(seconds * fps));
  const p =
    seconds > 8 ? easeInOutSine(clamp01((frame - total * 0.55) / (total * 0.3))) : 0;
  return (
    <AbsoluteFill style={p > 0 ? { transform: `scale(${1 + 0.035 * p})` } : undefined}>
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
    case 'stat_spotlight':
      return <StatSpotlight scene={scene} />;
    case 'quote_card':
      return <QuoteCard scene={scene} />;
    case 'outro_card':
      return <OutroCard scene={scene} />;
    case 'versus_card':
      return <VersusCard scene={scene} />;
    case 'animated_chart':
      return <AnimatedChart scene={scene} />;
    case 'big_counter':
      return <BigCounter scene={scene} />;
    case 'checklist_card':
      return <ChecklistCard scene={scene} />;
    case 'icon_grid':
      return <IconGrid scene={scene} />;
    case 'chapter_cover':
      return <ChapterCover scene={scene} />;
    case 'timeline_card':
      return <TimelineCard scene={scene} />;
    case 'step_flow':
      return <StepFlow scene={scene} />;
    case 'before_after':
      return <BeforeAfter scene={scene} />;
    case 'list_ranking':
      return <ListRanking scene={scene} />;
    case 'progress_meter':
      return <ProgressMeter scene={scene} />;
    case 'quote_portrait':
      return <QuotePortrait scene={scene} />;
    case 'single_focus':
    default:
      return <SingleFocus scene={scene} />;
  }
};

/**
 * Renders a full scene: living ambient background, then the layout content with
 * an entrance animation. The PHP validator guarantees a known layout_template.
 */
export const SceneRouter: React.FC<{
  scene: Scene;
  index?: number;
  count?: number;
  captions?: boolean;
}> = ({ scene, index = 0, count = 1, captions = false }) => {
  return (
    <AbsoluteFill>
      <SceneMetaProvider value={{ index, count, style: scene.style }}>
        {/* Per-scene narration (self-hosted Kokoro). Plays from the scene start;
            scene durations are paced to the audio length on the PHP side. */}
        {scene.narration_audio_url ? <Audio src={scene.narration_audio_url} volume={1.3} /> : null}
        <MidholdPush seconds={scene.duration_seconds}>
          <AmbientBackground imageUrl={scene.ambient_image_url} />
          <Entrance>
            <SceneLayout scene={scene} />
          </Entrance>
        </MidholdPush>
        {/* Narration-synced punchline (slides mode: the Sequence clock IS the
            narration clock, so no scene-window re-basing is needed). */}
        {scene.punchline ? <PunchLine scene={scene} /> : null}
        {/* Karaoke captions (§4.4) — screen space, above the layout, below
            nothing: the punchline docks at 7%, the captions chip at 8%; both
            never showing at once is the punchline service's job (it skips
            caption-length phrases). */}
        {captions ? <CaptionTrack scene={scene} /> : null}
      </SceneMetaProvider>
    </AbsoluteFill>
  );
};
