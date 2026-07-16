import React from 'react';
import { useVideoConfig, spring } from 'remotion';
import { Scene, MathStep } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useTheme, useDisplayFont, inkOn, MONO_FONT } from '../theme';
import { clamp01, easeOutQuint } from '../motion/easing';
import { SPRINGS } from '../motion/springs';
import { MathText, InlineMathText, parseMath, mathToPlain, mathWidthUnits } from '../math/mathText';

/**
 * BoardEquation — one chunk of the worked solution WRITTEN onto the board.
 *
 * Unlike the full-screen MathSteps slide, this renders only the derivation
 * lines, sized to a fixed board box (boxW×boxH world px), so consecutive
 * chunks stack into one continuous column that reads as a single teacher's
 * working. Each line wipes on left-to-right like chalk, paced to the
 * narration; the newest line owns the eye while earlier ones step back but
 * stay on the board; the last line is the answer in a solid accent chip.
 *
 * Everything is sized off the box (never useVideoConfig) so it stays correct
 * at whatever scale the board camera views it.
 */
export const BoardEquation: React.FC<{ scene: Scene; boxW: number; boxH: number }> = ({
  scene,
  boxW,
  boxH,
}) => {
  const slot = scene.slots?.['slot_math'] ?? Object.values(scene.slots ?? {})[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const { fps } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();

  const steps: MathStep[] = ((slot?.steps as MathStep[] | undefined) ?? []).filter(
    (s): s is MathStep => !!s && typeof s === 'object' && typeof s.expr === 'string' && s.expr.trim() !== ''
  );
  if (steps.length === 0) return null;

  const heading = (slot?.heading ?? '').toString().trim();
  const kicker = (scene.style?.kicker ?? slot?.label ?? '').toString().trim();

  // ---- Type sizing off the box --------------------------------------------
  const headH = heading ? boxH * 0.2 : 0;
  const kickH = kicker ? boxH * 0.07 : 0;
  const rowGap = boxH * 0.03;
  const rowZone = boxH - headH - kickH;
  const rowH = rowZone / (steps.length + 0.3);
  const maxUnits = Math.max(...steps.map((s) => mathWidthUnits(parseMath(s.expr))), 6);
  const byWidth = (boxW * 0.9) / (maxUnits * 0.6);
  const exprSize = Math.max(boxH * 0.05, Math.min(rowH * 0.46, byWidth, boxH * 0.13));
  const rule = Math.max(1, boxW * 0.0016);

  // ---- Pacing: land each line where its share of the narration begins ------
  const f = (n: number): number => Math.round((n / 30) * fps);
  const firstAt = f(heading ? 20 : 12);
  const words = scene.narration_words ?? [];
  let landAt: number[];
  if (words.length >= steps.length && steps.length > 1) {
    const minGap = f(8);
    const lastOk = Math.max(firstAt + minGap, durationInFrames * 0.85);
    landAt = steps.map((_, i) => {
      const w = words[Math.floor((i * words.length) / steps.length)];
      return Math.round((w?.start ?? 0) * fps);
    });
    landAt[0] = Math.max(firstAt, Math.min(landAt[0], lastOk));
    for (let i = 1; i < landAt.length; i++) {
      landAt[i] = Math.max(landAt[i - 1] + minGap, Math.min(landAt[i], lastOk));
    }
  } else {
    const lastBy = Math.max(firstAt + f(8), durationInFrames * 0.75);
    const gap =
      steps.length > 1
        ? Math.max(f(10), Math.min(f(46), (lastBy - firstAt) / (steps.length - 1)))
        : 0;
    landAt = steps.map((_, i) => Math.round(firstAt + i * gap));
  }
  const answerIdx = steps.length - 1;
  const headIn = easeOutQuint(clamp01(frame / f(12)));

  const row = (step: MathStep, i: number): React.ReactNode => {
    const local = frame - landAt[i];
    const inP = easeOutQuint(clamp01(local / f(12)));
    const noteP = easeOutQuint(clamp01((local - f(5)) / f(8)));
    const isAnswer = i === answerIdx && steps.length > 1;
    const dimP = i < answerIdx ? easeOutQuint(clamp01((frame - landAt[i + 1]) / f(8))) : 0;
    const dim = 1 - 0.45 * dimP;

    const note = mathToPlain(parseMath((step.note ?? '').toString().trim()));
    const noteEl = note ? (
      <span
        style={{
          fontFamily: MONO_FONT,
          fontSize: Math.max(exprSize * 0.32, boxH * 0.028),
          letterSpacing: boxW * 0.0012,
          textTransform: 'uppercase',
          color: theme.muted,
          opacity: noteP,
          whiteSpace: 'nowrap',
        }}
      >
        {note}
      </span>
    ) : null;

    const exprEl = isAnswer ? (
      <AnswerChip expr={step.expr} size={exprSize} landFrame={local} fps={fps} accent={theme.accent} font={displayFont} />
    ) : (
      <MathText
        expr={step.expr}
        color={theme.text}
        highlightFrom={i > 0 ? steps[i - 1].expr : null}
        highlightColor={theme.accent}
        style={{ fontFamily: displayFont, fontWeight: 800, fontSize: exprSize, lineHeight: 1.15 }}
      />
    );

    return (
      <div
        key={i}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: boxW * 0.03,
          minHeight: rowH,
          opacity: inP === 0 ? 0 : dim,
          transform: `translateY(${(1 - inP) * boxH * 0.02}px)`,
          clipPath: `inset(0 ${(1 - inP) * 100}% 0 0)`,
        }}
      >
        <span
          style={{
            fontFamily: MONO_FONT,
            fontSize: exprSize * 0.42,
            color: theme.muted,
            opacity: 0.6,
            minWidth: exprSize * 0.9,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {String(i + 1).padStart(2, '0')}
        </span>
        {exprEl}
        {noteEl}
      </div>
    );
  };

  return (
    <div
      style={{
        width: boxW,
        height: boxH,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        boxSizing: 'border-box',
      }}
    >
      {kicker ? (
        <div
          style={{
            fontFamily: MONO_FONT,
            fontSize: boxH * 0.04,
            letterSpacing: boxW * 0.004,
            textTransform: 'uppercase',
            color: theme.accent,
            marginBottom: boxH * 0.02,
            opacity: headIn,
          }}
        >
          {kicker}
        </div>
      ) : null}
      {heading ? (
        <div
          style={{
            fontFamily: displayFont,
            fontWeight: 900,
            fontSize: boxH * 0.085,
            lineHeight: 1.05,
            color: theme.text,
            marginBottom: boxH * 0.02,
            opacity: headIn,
            // a hairline rule under the heading — the top of the "board" panel
            borderBottom: `${rule}px solid ${theme.accent}`,
            paddingBottom: boxH * 0.02,
          }}
        >
          <InlineMathText text={heading} />
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: rowGap }}>
        {steps.map((s, i) => row(s, i))}
      </div>
    </div>
  );
};

/** The answer line: a solid accent chip that pops as it lands. */
const AnswerChip: React.FC<{
  expr: string;
  size: number;
  landFrame: number;
  fps: number;
  accent: string;
  font: string;
}> = ({ expr, size, landFrame, fps, accent, font }) => {
  const pop = spring({
    frame: Math.max(0, landFrame),
    fps,
    config: SPRINGS.pop,
    durationInFrames: Math.round(fps * 0.4),
  });
  return (
    <span
      style={{
        display: 'inline-flex',
        background: accent,
        padding: `${size * 0.2}px ${size * 0.38}px`,
        transform: `scale(${0.9 + 0.1 * Math.min(1.05, pop)})`,
        transformOrigin: 'left center',
        opacity: Math.min(1, pop * 1.4),
      }}
    >
      <MathText
        expr={expr}
        color={inkOn(accent)}
        style={{ fontFamily: font, fontWeight: 800, fontSize: size, lineHeight: 1.15 }}
      />
    </span>
  );
};
