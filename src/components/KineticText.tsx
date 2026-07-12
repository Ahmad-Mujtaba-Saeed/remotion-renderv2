import React from 'react';
import { useVideoConfig } from 'remotion';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useSceneMeta } from './SceneMeta';
import { useTheme, inkOn } from '../theme';
import { clamp01, easeOutCubic, easeOutQuint } from '../motion/easing';
import { exitProgress, f30 } from '../motion/choreo';
import { useMotionStyle } from '../motion/styles';
import { parseCountable, rollText } from '../motion/CountUp';
import { SfxCue } from '../sfx';

/** Normalize for highlight matching (case/punctuation-insensitive). */
const norm = (w: string): string => w.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Exit stagger between words (frames @30fps, Law 5). */
const EXIT_STAGGER_F = 2;
/** The outgoing transition window the exit leads (17f @30 = TRANSITION_SECONDS). */
const CUT_F = 17;

/**
 * Kinetic typography: reveals a heading word-by-word in a staggered cascade —
 * every number (duration, stagger, ease, entrance shape, exit speed) comes
 * from the active MOTION STYLE (§2.5), so the same heading feels cut by a
 * different editor in `crisp` vs `classic` vs `swiss`:
 *
 *  - rise_mask   (crisp)   rise 0.55em through a releasing baseline mask;
 *  - fade_settle (classic) pure documentary crossfade, scale 1.04→1.00;
 *  - pop_rise    (bounce)  playful back-eased pop, scale 0.92→1 + rise;
 *  - tracking_in (elegant) letter-spacing 0.28em→0.01em settles in;
 *  - column_snap (swiss)   a hard left→right clip snap — position+clip only.
 *
 * `highlight` paints the given words with the accent mark (§4.2): the drawn
 * underline (10f, starting 6f AFTER the word lands — the delay is the
 * signature), or the sweep block for the styles that want it. Numeric tokens
 * count up as they land (§4.3, tabular-nums); `tickOnCount` adds the
 * landmark tick_loop (stat cards only). Words exit in REVERSE order at the
 * style's exit ratio during the outgoing cut (§4.8), except on the video's
 * final scene. Transform/clip/colour only — camera-safe.
 */
export const KineticText: React.FC<{
  text: string;
  style?: React.CSSProperties;
  delay?: number;
  stagger?: number;
  highlight?: string[];
  highlightStyle?: 'underline' | 'sweep';
  /** Landmark tick under the first count-up (stat cards). */
  tickOnCount?: boolean;
  /** Opt out of the exit cascade (rare — content that must hold the frame). */
  exit?: boolean;
}> = ({ text, style, delay = 0, stagger, highlight, highlightStyle, tickOnCount, exit = true }) => {
  const { frame, durationInFrames } = useSceneClock();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const meta = useSceneMeta();
  const win = useSceneWindow();
  const motion = useMotionStyle();
  const words = (text || '').split(' ').filter(Boolean);
  const step = stagger ?? f30(fps, motion.staggerF);
  const dur = f30(fps, motion.baseF);
  const marked = new Set((highlight ?? []).map(norm).filter(Boolean));
  const sweep = (highlightStyle ?? motion.highlight) === 'sweep';
  const sweepInk = inkOn(theme.accent);

  // ---- Exit window (§4.8) ---------------------------------------------------
  // Words start leaving so the LAST one (word 0, reverse order) is gone as the
  // cut commits. Skipped on the video's final scene (nothing follows the
  // outro) and when the scene is too short to finish entering first.
  const isLastScene = meta.index >= meta.count - 1;
  const exitDur = Math.max(3, f30(fps, Math.round(motion.baseF * motion.exitRatio)));
  const exitStep = f30(fps, EXIT_STAGGER_F);
  const exitSpan = exitDur + (words.length - 1) * exitStep;
  const exitStart = durationInFrames - Math.max(f30(fps, CUT_F), exitSpan);
  const enterDone = delay + (words.length - 1) * step + dur;
  const exitEnabled = exit && !isLastScene && exitStart > enterDone + f30(fps, 8);

  // The first numeric token carries the (optional) landmark tick. Its cue is
  // addressed in the CURRENT clock: global in canvas mode (window start +
  // local offset), scene-local in slides.
  const firstCountable = words.findIndex((w) => parseCountable(w) !== null);

  return (
    <span style={style}>
      {tickOnCount && firstCountable >= 0 ? (
        <SfxCue
          name="tick_loop"
          at={(win?.start ?? 0) + delay + firstCountable * step}
          volume={1}
          playbackRate={1.25}
        />
      ) : null}
      {words.map((word, i) => {
        const local = frame - delay - i * step;
        const e = motion.ease(clamp01(local / dur));
        const hot = marked.size > 0 && marked.has(norm(word));
        // The accent mark waits a beat AFTER the word lands (6f), then draws
        // over 10f — the delay is the signature; do not make it simultaneous.
        const mark = hot ? easeOutQuint(clamp01((local - f30(fps, 6)) / f30(fps, 10))) : 0;

        // Reverse-order exit: word i leaves at slot (n-1-i).
        const exitP = exitEnabled
          ? exitProgress(frame, exitStart + (words.length - 1 - i) * exitStep, exitDur)
          : 0;

        const countable = parseCountable(word);
        const content = countable ? rollText(countable, Math.max(0, local), fps) : word;

        // ---- The style's entrance shape (§2.5 vocabularies) -----------------
        let fade = easeOutCubic(clamp01(local / (dur * 0.75)));
        const transforms: string[] = [];
        let clipPath: string | undefined;
        let letterSpacing: string | undefined;

        switch (motion.entrance) {
          case 'fade_settle':
            fade = motion.ease(clamp01(local / dur));
            transforms.push(`scale(${1.04 - 0.04 * e})`);
            break;
          case 'pop_rise':
            transforms.push(`translateY(${(1 - e) * 0.4}em)`, `scale(${0.92 + 0.08 * e})`);
            break;
          case 'tracking_in':
            fade = motion.ease(clamp01(local / dur));
            letterSpacing = `${Math.max(0.01, 0.28 - 0.27 * e)}em`;
            break;
          case 'column_snap':
            // Position + clip only — swiss never scales anything.
            fade = local >= 0 ? 1 : 0;
            clipPath = e < 1 ? `inset(-10% ${(1 - e) * 100}% -12% 0)` : undefined;
            break;
          case 'rise_mask':
          default: {
            transforms.push(`translateY(${(1 - e) * 0.55}em)`);
            // The baseline mask releases a hair behind the rise.
            const m = motion.ease(clamp01((local - 1) / dur));
            clipPath = m < 1 ? `inset(-15% -6% ${(1 - m) * 60}% -6%)` : undefined;
            break;
          }
        }
        if (exitP > 0) {
          transforms.push(`translateY(${-exitP * 0.35}em)`);
        }

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              marginRight: '0.28em',
              position: 'relative',
              opacity: fade * (1 - exitP),
              ...(transforms.length ? { transform: transforms.join(' ') } : null),
              ...(clipPath ? { clipPath } : null),
              ...(letterSpacing ? { letterSpacing } : null),
              ...(countable ? { fontVariantNumeric: 'tabular-nums' as const } : null),
              // Sweep: the word keeps its inherited ink until the accent
              // block covers it, then flips to the opposite pole. Underline:
              // the word itself turns accent as it lands.
              ...(hot
                ? sweep
                  ? mark > 0.4
                    ? { color: sweepInk }
                    : null
                  : { color: theme.accent }
                : null),
            }}
          >
            {hot && sweep ? (
              <span
                style={{
                  position: 'absolute',
                  left: '-0.12em',
                  right: '-0.12em',
                  top: '-0.02em',
                  bottom: '-0.02em',
                  background: theme.accent,
                  transformOrigin: 'left center',
                  transform: `scaleX(${mark})`,
                  zIndex: -1,
                  pointerEvents: 'none',
                }}
              />
            ) : null}
            {content}
            {hot && !sweep ? (
              <span
                style={{
                  position: 'absolute',
                  left: '-0.02em',
                  right: '-0.02em',
                  bottom: '-0.04em',
                  height: '0.07em',
                  background: theme.accent,
                  transformOrigin: 'left center',
                  transform: `scaleX(${mark})`,
                  pointerEvents: 'none',
                }}
              />
            ) : null}
          </span>
        );
      })}
    </span>
  );
};
