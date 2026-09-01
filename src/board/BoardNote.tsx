import React from 'react';
import { useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useTheme, useDisplayFont, MONO_FONT } from '../theme';
import { clamp01, easeOutQuint, easeOutCubic } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { InlineMathText } from '../math/mathText';

/** Best-effort title/body/bullets out of an arbitrary text scene's slots. */
const extractNote = (scene: Scene): { title: string; body: string; bullets: string[] } => {
  let heading = '';
  let body = '';
  const bullets: string[] = [];
  for (const slot of Object.values(scene.slots ?? {})) {
    if (!heading) heading = (slot.heading ?? slot.label ?? '').toString().trim();
    if (!body) body = (slot.body ?? slot.caption ?? '').toString().trim();
    if (bullets.length === 0 && Array.isArray(slot.bullets)) {
      bullets.push(...slot.bullets.map((b) => String(b)));
    }
    if (bullets.length === 0 && Array.isArray(slot.items)) {
      bullets.push(
        ...slot.items.map((it) =>
          typeof it === 'string' ? it : String((it as { label?: string; text?: string }).label ?? (it as { text?: string }).text ?? '')
        ).filter(Boolean)
      );
    }
  }
  const narration = (scene.narration?.text ?? '').toString().trim();
  const title = heading || (scene.style?.kicker ?? '').toString().trim() || firstSentence(narration);
  if (!body && bullets.length === 0) body = narration;
  return { title, body, bullets: bullets.slice(0, 4) };
};

const firstSentence = (s: string): string => {
  const m = /^.*?[.!?](\s|$)/.exec(s);
  return (m ? m[0] : s).trim().slice(0, 90);
};

/**
 * BoardNote — a text beat written on the board: the opening problem, a concept
 * aside the working pauses on, or the closing note. `variant` 'concept' pins an
 * accent margin bar and a small kicker (the camera detours here and returns);
 * 'note' centres a heading + supporting line. Sized entirely off its box.
 */
export const BoardNote: React.FC<{
  scene: Scene;
  boxW: number;
  boxH: number;
  variant: 'note' | 'concept';
}> = ({ scene, boxW, boxH, variant }) => {
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const { frame } = useSceneClock();
  const { fps } = useVideoConfig();
  const { title, body, bullets } = extractNote(scene);

  // Authored at 30fps, scaled with f30 — the last card in the tree that still
  // hardcoded raw frame counts, which meant a 60fps render played its entrance
  // at double speed.
  const rise = easeOutQuint(clamp01(frame / f30(fps, 14)));
  const bodyIn = easeOutCubic(clamp01((frame - f30(fps, 8)) / f30(fps, 16)));
  const kicker =
    variant === 'concept'
      ? ((scene.style?.kicker ?? 'concept').toString().trim() || 'concept')
      : (scene.style?.kicker ?? '').toString().trim();

  const isConcept = variant === 'concept';
  const bar = Math.max(2, boxW * 0.006);

  const bodyText = body.slice(0, 260);

  return (
    <div
      style={{
        width: boxW,
        height: boxH,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: isConcept ? 'flex-start' : 'center',
        textAlign: isConcept ? 'left' : 'center',
        paddingLeft: isConcept ? boxW * 0.06 : 0,
        borderLeft: isConcept ? `${bar}px solid ${theme.accent}` : undefined,
        boxSizing: 'border-box',
      }}
    >
      {kicker ? (
        <div
          style={{
            fontFamily: MONO_FONT,
            fontSize: boxH * 0.045,
            letterSpacing: boxW * 0.005,
            textTransform: 'uppercase',
            color: theme.accent,
            marginBottom: boxH * 0.03,
            opacity: rise,
          }}
        >
          {kicker}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: displayFont,
          fontWeight: 900,
          fontSize: boxH * (isConcept ? 0.12 : 0.15),
          lineHeight: 1.06,
          color: theme.text,
          opacity: rise,
          transform: `translateY(${(1 - rise) * boxH * 0.03}px)`,
          maxWidth: '100%',
        }}
      >
        <InlineMathText text={title} />
      </div>
      {bullets.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: boxH * 0.03, marginTop: boxH * 0.05, opacity: bodyIn }}>
          {bullets.map((b, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: boxW * 0.02,
                fontFamily: displayFont,
                fontSize: boxH * 0.058,
                color: theme.text,
              }}
            >
              <span style={{ color: theme.accent, fontFamily: MONO_FONT, fontSize: boxH * 0.05 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span><InlineMathText text={b} /></span>
            </div>
          ))}
        </div>
      ) : bodyText ? (
        <div
          style={{
            fontFamily: displayFont,
            fontWeight: 500,
            fontSize: boxH * 0.058,
            lineHeight: 1.35,
            color: theme.muted,
            marginTop: boxH * 0.04,
            opacity: bodyIn,
            maxWidth: isConcept ? '92%' : '84%',
          }}
        >
          <InlineMathText text={bodyText} />
        </div>
      ) : null}
    </div>
  );
};
