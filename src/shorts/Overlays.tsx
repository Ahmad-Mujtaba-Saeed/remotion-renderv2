import React from 'react';
import { AbsoluteFill, Img, Sequence, Video, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ShortEvent, ShortProps, ShortStyle } from './types';
import { EMOJI_STACK, fontStack } from './assets';

/**
 * Everything drawn over the footage: the hook card, meme pops (emoji and
 * text stickers), flashes, glitch bars, cutaway b-roll, the progress bar and
 * the vignette. Each is a pure function of the output clock.
 */

const noise = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** Frame-to-frame camera shake offset (px) at output time t. */
export const shakeAt = (events: ShortEvent[], t: number, frame: number): { x: number; y: number; r: number } => {
  let x = 0;
  let y = 0;
  let r = 0;
  for (const e of events) {
    if (e.type !== 'shake' || t < e.start || t > e.end) continue;
    const decay = 1 - (t - e.start) / Math.max(0.05, e.end - e.start);
    const amp = 26 * e.intensity * Math.max(0, decay);
    x += (noise(frame * 1.3 + 1) - 0.5) * 2 * amp;
    y += (noise(frame * 1.7 + 7) - 0.5) * 2 * amp;
    r += (noise(frame * 2.1 + 3) - 0.5) * 2 * e.intensity * 1.6 * Math.max(0, decay);
  }
  return { x, y, r };
};

export const isBw = (events: ShortEvent[], t: number) =>
  events.some((e) => e.type === 'bw' && t >= e.start && t <= e.end);

export const Hook: React.FC<{ hook: NonNullable<ShortProps['hook']>; style: ShortStyle }> = ({ hook, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  if (style.hook.style === 'none' || t > hook.until + 0.3) return null;

  const enter = spring({ frame, fps, config: { damping: 13, stiffness: 190 }, durationInFrames: 14 });
  const exit = Math.max(0, Math.min(1, (hook.until + 0.3 - t) / 0.3));
  const h = style.hook;
  const text = hook.text;
  const size = text.length > 38 ? 62 : text.length > 24 ? 72 : 84;

  const base: React.CSSProperties = {
    position: 'absolute',
    left: width * 0.06,
    width: width * 0.88,
    top: height * h.y,
    transform: `translateY(-50%) scale(${0.7 + 0.3 * enter})`,
    opacity: exit * Math.min(1, frame / 3),
    display: 'flex',
    justifyContent: 'center',
    textAlign: 'center',
    fontFamily: fontStack(h.font),
  };

  const label = (
    <>
      {text}
      {hook.emoji ? <span style={{ fontFamily: EMOJI_STACK, marginLeft: size * 0.2 }}>{hook.emoji}</span> : null}
    </>
  );

  if (h.style === 'banner') {
    return (
      <div style={base}>
        <div
          style={{
            background: h.bg,
            color: h.color,
            fontSize: size,
            fontWeight: 900,
            padding: `${size * 0.22}px ${size * 0.45}px`,
            borderRadius: size * 0.2,
            lineHeight: 1.1,
            boxShadow: '0 12px 0 rgba(0,0,0,0.35)',
          }}
        >
          {label}
        </div>
      </div>
    );
  }
  if (h.style === 'bubble') {
    return (
      <div style={base}>
        <div
          style={{
            background: '#ffffff',
            color: '#101010',
            fontSize: size * 0.9,
            fontWeight: 800,
            padding: `${size * 0.3}px ${size * 0.5}px`,
            borderRadius: size * 0.6,
            lineHeight: 1.12,
            border: `6px solid ${h.bg}`,
          }}
        >
          {label}
        </div>
      </div>
    );
  }
  if (h.style === 'tape') {
    return (
      <div style={{ ...base, transform: `${base.transform} rotate(-3deg)` }}>
        <div
          style={{
            background: h.bg,
            color: h.color,
            fontSize: size * 0.95,
            fontWeight: 900,
            padding: `${size * 0.16}px ${size * 0.5}px`,
            lineHeight: 1.1,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
      </div>
    );
  }
  // bold
  return (
    <div style={base}>
      <div
        style={{
          color: h.color,
          fontSize: size * 1.1,
          fontWeight: 900,
          lineHeight: 1.05,
          textTransform: 'uppercase',
          WebkitTextStroke: `10px ${h.bg}`,
          paintOrder: 'stroke fill',
        }}
      >
        {label}
      </div>
    </div>
  );
};

const Pop: React.FC<{ start: number; end: number; children: (p: number, fade: number, wobble: number) => React.ReactNode }> = ({
  start,
  end,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < start || t > end) return null;
  const since = frame - Math.round(start * fps);
  const p = spring({ frame: since, fps, config: { damping: 8, stiffness: 200 }, durationInFrames: 16 });
  const fade = Math.max(0, Math.min(1, (end - t) / 0.18));
  const wobble = Math.sin(since / 3) * 4 * Math.max(0, 1 - since / 20);
  return <>{children(p, fade, wobble)}</>;
};

/**
 * A line of context from the editor — what a viewer who did not watch the
 * stream is missing.
 *
 * It is drawn deliberately unlike the captions: a flat dark slab with a thin
 * accent rule and a normal-weight sans face, never the caption font, never the
 * caption colours, never in the caption's position. The whole point is that
 * the viewer can tell at a glance that nobody on screen said this. A card that
 * looks like a caption is worse than no card, because it puts words in a real
 * person's mouth.
 */
const ContextCard: React.FC<{
  event: Extract<ShortEvent, { type: 'context' }>;
  style: ShortStyle;
}> = ({ event, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  if (t < event.start || t > event.end) return null;

  const since = frame - Math.round(event.start * fps);
  const enter = spring({ frame: since, fps, config: { damping: 18, stiffness: 200 }, durationInFrames: 10 });
  const out = Math.max(0, Math.min(1, (event.end - t) / 0.28));
  const top = (event.place ?? 'top') === 'top';

  return (
    <div
      style={{
        position: 'absolute',
        left: width * 0.07,
        width: width * 0.86,
        [top ? 'top' : 'bottom']: height * 0.14,
        display: 'flex',
        alignItems: 'center',
        gap: width * 0.028,
        padding: `${width * 0.032}px ${width * 0.038}px`,
        borderRadius: width * 0.032,
        background: 'rgba(8,10,14,0.88)',
        borderLeft: `${Math.round(width * 0.011)}px solid ${style.accent}`,
        boxShadow: '0 18px 44px rgba(0,0,0,0.5)',
        transform: `translateY(${(1 - enter) * (top ? -34 : 34)}px)`,
        opacity: Math.min(enter, out),
        boxSizing: 'border-box',
      }}
    >
      {event.icon ? (
        <div style={{ fontSize: width * 0.062, fontFamily: EMOJI_STACK, lineHeight: 1, flexShrink: 0 }}>
          {event.icon}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: fontStack('inter'),
          fontWeight: 600,
          fontSize: event.text.length > 64 ? width * 0.039 : width * 0.046,
          lineHeight: 1.26,
          color: '#f2f5f9',
          letterSpacing: '-0.01em',
        }}
      >
        {event.text}
      </div>
    </div>
  );
};

export const EventOverlays: React.FC<{ props: ShortProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const style = props.style;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {props.events.map((e, i) => {
        if (e.type === 'context') {
          return <ContextCard key={i} event={e} style={style} />;
        }
        if (e.type === 'emoji') {
          return (
            <Pop key={i} start={e.start} end={e.end}>
              {(p, fade, wob) => (
                <div
                  style={{
                    position: 'absolute',
                    left: e.x * width,
                    top: e.y * height,
                    transform: `translate(-50%, -50%) scale(${p}) rotate(${wob * 3}deg)`,
                    opacity: fade,
                    fontSize: (e.size ?? 0.16) * width,
                    fontFamily: EMOJI_STACK,
                    lineHeight: 1,
                    filter: 'drop-shadow(0 10px 10px rgba(0,0,0,0.45))',
                  }}
                >
                  {e.emoji}
                </div>
              )}
            </Pop>
          );
        }
        if (e.type === 'sticker') {
          const variant = e.variant ?? 'meme';
          return (
            <Pop key={i} start={e.start} end={e.end}>
              {(p, fade, wob) => {
                const common: React.CSSProperties = {
                  position: 'absolute',
                  left: e.x * width,
                  top: e.y * height,
                  transform: `translate(-50%, -50%) scale(${p}) rotate(${(e.rotate ?? -4) + wob}deg)`,
                  opacity: fade,
                  fontFamily: fontStack(variant === 'impact' ? 'impact' : style.stickerFont),
                  whiteSpace: 'nowrap',
                  lineHeight: 1,
                };
                if (variant === 'bubble') {
                  return (
                    <div style={{ ...common, background: '#fff', color: '#111', fontSize: 58, fontWeight: 800, padding: '18px 30px', borderRadius: 40, border: `6px solid ${style.accent}` }}>
                      {e.text}
                    </div>
                  );
                }
                if (variant === 'label') {
                  return (
                    <div style={{ ...common, background: style.accent, color: '#fff', fontSize: 50, fontWeight: 800, padding: '14px 26px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {e.text}
                    </div>
                  );
                }
                return (
                  <div
                    style={{
                      ...common,
                      color: variant === 'impact' ? '#fff' : style.accent,
                      fontSize: variant === 'impact' ? 118 : 104,
                      fontWeight: 900,
                      textTransform: 'uppercase',
                      WebkitTextStroke: '12px #000',
                      paintOrder: 'stroke fill',
                      filter: 'drop-shadow(0 8px 0 rgba(0,0,0,0.6))',
                    }}
                  >
                    {e.text}
                  </div>
                );
              }}
            </Pop>
          );
        }
        if (e.type === 'flash') {
          const dur = e.duration ?? 0.16;
          if (t < e.start || t > e.start + dur) return null;
          return (
            <AbsoluteFill
              key={i}
              style={{ background: e.color ?? '#ffffff', opacity: 0.85 * (1 - (t - e.start) / dur) }}
            />
          );
        }
        if (e.type === 'glitch') {
          if (t < e.start || t > e.end) return null;
          const bars = Array.from({ length: 7 }, (_, k) => {
            const n = noise(frame * 3 + k * 17);
            return (
              <div
                key={k}
                style={{
                  position: 'absolute',
                  left: (noise(frame + k) - 0.5) * 80,
                  width: width + 80,
                  top: n * height,
                  height: 10 + noise(frame * 5 + k) * 60,
                  background: k % 2 ? 'rgba(255,0,90,0.35)' : 'rgba(0,240,255,0.35)',
                  mixBlendMode: 'screen',
                }}
              />
            );
          });
          return <AbsoluteFill key={i}>{bars}</AbsoluteFill>;
        }
        if (e.type === 'broll') {
          const from = Math.round(e.start * fps);
          const dur = Math.max(1, Math.round((e.end - e.start) * fps));
          const local = frame - from;
          const zoom = 1.06 + 0.08 * (local / dur);
          const inner =
            e.kind === 'video' ? (
              <Video src={e.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Img src={e.url} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
            );
          return (
            <Sequence key={i} from={from} durationInFrames={dur} layout="none">
              {e.mode === 'full' ? (
                <AbsoluteFill style={{ overflow: 'hidden' }}>{inner}</AbsoluteFill>
              ) : (
                <div
                  style={{
                    position: 'absolute',
                    left: width * 0.1,
                    top: height * 0.1,
                    width: width * 0.8,
                    height: width * 0.8 * 0.62,
                    overflow: 'hidden',
                    borderRadius: 28,
                    border: `6px solid ${style.accent}`,
                    transform: `scale(${spring({ frame: local, fps, config: { damping: 14 }, durationInFrames: 12 })})`,
                  }}
                >
                  {inner}
                </div>
              )}
            </Sequence>
          );
        }
        return null;
      })}
    </AbsoluteFill>
  );
};

export const ProgressBar: React.FC<{ style: ShortStyle; total: number }> = ({ style, total }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (style.progress.position === 'none') return null;
  const p = Math.min(1, frame / Math.max(1, total * fps));
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: style.progress.position === 'top' ? 0 : height - style.progress.height,
        width: width * p,
        height: style.progress.height,
        background: style.progress.color,
      }}
    />
  );
};

export const Vignette: React.FC<{ amount: number; tint?: string | null }> = ({ amount, tint }) => (
  <>
    {tint ? <AbsoluteFill style={{ background: tint, mixBlendMode: 'soft-light' }} /> : null}
    {amount > 0 ? (
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${Math.min(0.85, amount)}) 100%)`,
        }}
      />
    ) : null}
  </>
);
