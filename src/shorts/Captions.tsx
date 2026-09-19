import React, { useMemo } from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionStyle, CaptionWord } from './types';
import { fontStack } from './assets';

/**
 * Word-synced captions in one of several looks. Words arrive already on the
 * OUTPUT clock (the backend mapped them through the timeline), so this only
 * groups, lays out and animates.
 *
 * A line is shown whole, from its first word until the next line starts, with
 * the spoken word highlighted as it goes — so a line never lingers over a
 * silence, never flashes past a fast talker, and never moves once it is up.
 */

interface Group {
  words: CaptionWord[];
  start: number;
  end: number;
}

/**
 * Break the words into the lines that will be shown, one at a time.
 *
 * Grouped by LENGTH IN CHARACTERS, not by a word count. A count makes lines of
 * wildly different widths — at two words per line, "IT'S A" and "EVERYTHING
 * CHANGED" are the same group size and three times apart in width — and since
 * every line is centred, each change of width moves the whole block sideways.
 * Measured on a real short: the caption block's left edge swung between 261px
 * and 410px. Lines of a similar width barely move at all.
 *
 * `perLine` survives as the caller's taste knob: it sets the target width (a
 * word is about 6 characters), so a style asking for 2 words still gets short
 * punchy lines and one asking for 5 still gets full sentences.
 */
const groupWords = (words: CaptionWord[], perLine: number, capacityChars: number): Group[] => {
  // One word per line is a look, not a width: the huge single word that snaps
  // to the next. It is also inherently stable — a lone centred word has
  // nothing to reflow against — so it keeps its own path rather than being
  // rounded up to the character target below.
  if (perLine <= 1) {
    const singles = words.map((w) => ({ words: [w], start: w.start, end: w.end }));
    return holdGroups(singles);
  }

  // The style asks for a width; the FONT decides what actually fits. A meme
  // caption at 116px holds about 13 characters on a 1080 canvas and a clean
  // podcast caption at 60px holds 26, so a fixed character target overflows
  // one and starves the other. Whichever is smaller wins, and the line never
  // wraps — a wrapped line is two rows tall, and the block gaining a row is
  // the same jump all over again, in the other axis.
  const targetChars = Math.max(6, Math.min(perLine * 6, capacityChars));
  const maxChars = Math.max(targetChars, capacityChars);
  const groups: Group[] = [];
  let cur: CaptionWord[] = [];
  let chars = 0;
  const flush = () => {
    if (!cur.length) return;
    groups.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
    chars = 0;
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length && prev && w.start - prev.end > 0.55) flush();
    const len = w.text.length + 1;
    // Adding this word would overshoot badly — start the line without it.
    if (cur.length && chars + len > maxChars) flush();
    cur.push(w);
    chars += len;
    const sentenceEnd = /[.!?]["')]?$/.test(w.text);
    if (chars >= targetChars || sentenceEnd) {
      flush();
    }
  });
  flush();
  return holdGroups(groups);
};

/** Hold each group until the next one starts (capped), so there is no blink. */
const holdGroups = (groups: Group[]): Group[] => {
  for (let i = 0; i < groups.length; i++) {
    const next = groups[i + 1];
    const hold = next ? Math.min(next.start, groups[i].end + 0.7) : groups[i].end + 0.6;
    groups[i].end = Math.max(groups[i].end, hold);
  }
  return groups;
};

const clean = (text: string, style: CaptionStyle) => {
  let t = text;
  if (style.uppercase) t = t.toUpperCase();
  else if (style.lowercase) t = t.toLowerCase();
  // Big meme captions read better without trailing commas and full stops.
  if (style.wordsPerLine <= 3) t = t.replace(/[.,;:]+$/, '');
  return t;
};

export const Captions: React.FC<{ words: CaptionWord[]; style: CaptionStyle }> = ({ words, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  // How many characters of THIS face at THIS size fit across the caption box.
  // 0.55em is the average advance of the bold condensed uppercase faces these
  // styles use; the 0.92 keeps a margin so a wide word never touches the edge.
  const capacityChars = Math.max(
    6,
    Math.floor((width * 0.88 * 0.92) / (style.size * 0.55))
  );
  const groups = useMemo(
    () => groupWords(words, Math.max(1, style.wordsPerLine), capacityChars),
    [words, style.wordsPerLine, capacityChars]
  );

  const group = groups.find((g) => t >= g.start && t < g.end);
  if (!group) return null;

  const since = Math.max(0, frame - Math.round(group.start * fps));
  const enter = spring({
    frame: since,
    fps,
    config: style.animation === 'bounce' ? { damping: 9, stiffness: 180 } : { damping: 16, stiffness: 220 },
    durationInFrames: 12,
  });

  // Every entrance is a transform or an opacity on the WHOLE line, so it can
  // never change where a word sits. `typewriter` and `karaoke` no longer name
  // a per-word reveal (see the block comment below) — they are a quick scale
  // and a plain cut, and the highlight running along the line is what makes
  // them read as typed or sung.
  let blockTransform = '';
  let blockOpacity = 1;
  switch (style.animation) {
    case 'pop':
    case 'bounce':
      blockTransform = `scale(${0.6 + 0.4 * enter})`;
      break;
    case 'typewriter':
      blockTransform = `scale(${0.88 + 0.12 * enter})`;
      blockOpacity = Math.min(1, since / 3);
      break;
    case 'slide':
      blockTransform = `translateY(${(1 - enter) * 60}px)`;
      blockOpacity = Math.min(1, since / 4);
      break;
    case 'fade':
      blockOpacity = Math.min(1, since / 6);
      break;
    default:
      break;
  }

  const size = style.size;
  const stroke = style.stroke;

  return (
    <div
      style={{
        position: 'absolute',
        left: width * 0.06,
        width: width * 0.88,
        top: height * style.y,
        transform: `translateY(-50%) rotate(${style.rotate ?? 0}deg)`,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: `${size * 0.12}px ${size * 0.26}px`,
          transform: blockTransform,
          opacity: blockOpacity,
          padding: style.background ? `${size * 0.22}px ${size * 0.4}px` : 0,
          background: style.background ?? undefined,
          borderRadius: style.background ? size * 0.3 : 0,
          fontFamily: fontStack(style.font),
          fontWeight: style.weight,
          fontSize: size,
          lineHeight: 1.08,
          textAlign: 'center',
          letterSpacing: style.uppercase ? '0.01em' : undefined,
        }}
      >
        {group.words.map((w, i) => {
          const active = t >= w.start && t < Math.max(w.end, w.start + 0.12);
          const spoken = t >= w.start;

          // THE WHOLE LINE IS VISIBLE FROM THE MOMENT THE LINE STARTS.
          //
          // This used to reveal word by word — hidden, or popped in from
          // scale 0, as each word was spoken. Two shipped batches read as
          // "glitching" because of it. The layout never moved (a transform
          // does not reflow), but what the EYE tracks is the visible text, and
          // a centred line whose visible half grows to the right looks exactly
          // like a block sliding sideways. No short worth copying does a
          // progressive reveal on centred text; they put the line up and run a
          // highlight along it, which is also what "captions moving with the
          // person speaking" actually means.
          //
          // So entrance animation belongs to the BLOCK (blockTransform above),
          // and the only thing that moves per word is the active highlight.
          const wordPop = 1;

          let color = w.key ? style.keyColor : style.color;
          let bg: string | undefined;
          let scale = wordPop;
          let underline: string | undefined;
          if (active) {
            switch (style.highlightMode) {
              case 'color':
                color = style.highlight;
                break;
              case 'box':
                bg = style.highlight;
                color = pickInk(style.highlight);
                break;
              case 'scale':
                color = style.highlight;
                scale *= 1.14;
                break;
              case 'underline':
                underline = style.highlight;
                break;
              default:
                break;
            }
          } else if (style.animation === 'karaoke' && !spoken) {
            color = withAlpha(style.color, 0.45);
          }

          const needsStroke = stroke > 0 && !bg;
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                color,
                background: bg,
                // Constant padding, conditional background. Padding only on the
                // highlighted word would widen it as it lit up and shove the
                // rest of the line along with it.
                padding: style.highlightMode === 'box' ? `0 ${size * 0.12}px` : undefined,
                borderRadius: bg ? size * 0.14 : undefined,
                transform: `scale(${scale})`,
                WebkitTextStroke: needsStroke ? `${stroke}px ${style.strokeColor}` : undefined,
                paintOrder: 'stroke fill',
                textShadow: style.shadow ? `0 ${size * 0.06}px ${size * 0.02}px rgba(0,0,0,0.85)` : undefined,
                boxShadow: underline ? `inset 0 -${Math.round(size * 0.12)}px 0 ${underline}` : undefined,
                whiteSpace: 'nowrap',
              }}
            >
              {clean(w.text, style)}
              {w.emoji ? <span style={{ WebkitTextStroke: '0px', marginLeft: size * 0.15 }}>{w.emoji}</span> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
};

function pickInk(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#000';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#0b0b0b' : '#ffffff';
}

function withAlpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
