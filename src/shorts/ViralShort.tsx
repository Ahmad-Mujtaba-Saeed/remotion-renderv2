import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ShortProps } from './types';
import { placeSegments, totalSeconds } from './timeline';
import { Panels } from './Panels';
import { Captions } from './Captions';
import { EventOverlays, Hook, Vignette, isBw, shakeAt } from './Overlays';
import { ShortFontLoader, ShortSfx } from './assets';

/**
 * ViralShort — one fully edited vertical short.
 *
 * Layer order, back to front:
 *   footage panels (+ blurred backdrop)  ─┐ shaken together,
 *   colour grade / b&w windows            │ graded together
 *   vignette + tint                      ─┘
 *   b-roll cutaways, glitch bars, flashes, emoji and sticker pops
 *   hook card, captions
 * Audio: the clip's own sound per timeline segment (freezes are silent),
 * meme SFX on their cues, an optional music bed.
 */
export const ViralShort: React.FC<ShortProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const placed = useMemo(() => placeSegments(props.segments), [props.segments]);
  const total = useMemo(() => totalSeconds(props.segments), [props.segments]);
  const shake = shakeAt(props.events, t, frame);
  const grade = [props.style.grade.filter, isBw(props.events, t) ? 'grayscale(1) contrast(1.25)' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <ShortFontLoader />

      <AbsoluteFill
        style={{
          transform:
            shake.x || shake.y || shake.r
              ? `translate(${shake.x}px, ${shake.y}px) rotate(${shake.r}deg) scale(1.04)`
              : undefined,
        }}
      >
        <Panels props={props} placed={placed} total={total} filter={grade || undefined} />
        <Vignette amount={props.style.grade.vignette} tint={props.style.grade.tint} />
      </AbsoluteFill>

      <EventOverlays props={props} />

      {props.hook ? <Hook hook={props.hook} style={props.style} /> : null}
      {props.captionsEnabled ? <Captions words={props.words} style={props.style.caption} /> : null}
      {/* No progress bar: an identical strip on every short is a platform
          fingerprint, the easiest tell that a batch came off one template. */}

      {/* The clip's own audio, segment by segment. */}
      {placed.map((seg, i) =>
        seg.freeze ? null : (
          <Sequence
            key={`a${i}`}
            from={Math.round(seg.out * fps)}
            durationInFrames={Math.max(1, Math.round((seg.out + seg.dur) * fps) - Math.round(seg.out * fps))}
            layout="none"
          >
            <Audio
              src={props.video.url}
              trimBefore={Math.max(0, Math.round(seg.src * fps))}
              playbackRate={seg.rate || 1}
              volume={(f) => (props.sourceVolume ?? 1) * duckAt(props.events, (Math.round(seg.out * fps) + f) / fps)}
            />
          </Sequence>
        )
      )}

      {props.events.map((e, i) =>
        e.type === 'sfx' ? (
          <ShortSfx key={`s${i}`} name={e.name} at={e.start} volume={(e.volume ?? 1) * props.style.sfxVolume} />
        ) : null
      )}

      {props.events.map((e, i) =>
        e.type === 'voice' ? (
          <Sequence key={`v${i}`} from={Math.round(e.start * fps)} layout="none">
            <Audio src={e.url} volume={e.volume ?? 1} />
          </Sequence>
        ) : null
      )}

      {props.music ? (
        <Audio src={props.music.url} volume={(f) => props.music!.volume * duckAt(props.events, f / fps)} loop />
      ) : null}
    </AbsoluteFill>
  );
};

/** Source/music gain under narrator lines: ramps down 0.15s before, back up after. */
const duckAt = (events: ShortProps['events'], t: number): number => {
  let g = 1;
  for (const e of events) {
    if (e.type !== 'voice') continue;
    const low = e.duck ?? 0.22;
    const k = Math.min(1, Math.max(0, Math.min(t - (e.start - 0.15), e.end + 0.2 - t) / 0.15));
    g = Math.min(g, 1 - (1 - low) * k);
  }
  return g;
};

export const shortDurationFrames = (props: ShortProps): number =>
  Math.max(1, Math.round(totalSeconds(props.segments ?? []) * (props.fps || 30)));
