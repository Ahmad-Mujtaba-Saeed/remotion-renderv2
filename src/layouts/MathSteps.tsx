import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, MathStep, MathRule } from '../types';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';
import { MathText, parseMath, mathToPlain, mathWidthUnits } from '../math/mathText';
import { StepArrows } from '../math/StepArrows';
import { KineticText } from '../components/KineticText';
import { SfxCue } from '../sfx';

/**
 * math_steps — a worked solution, line by line. Each step is one expression
 * in the linear math notation (MathText typesets fractions, radicals and
 * scripts natively) with an optional ≤6-word margin note explaining the move
 * ("subtract 5 from both sides"). Steps land sequentially, paced across the
 * scene so the working tracks the narration; landed steps dim so the eye
 * always rides the newest line. The LAST step is the answer: it arrives in a
 * solid accent chip with a stamp — the QED moment.
 *
 * Flat rules hold: solid surfaces, hairline fraction bars, no shadows.
 */
export const MathSteps: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_math'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();
  const win = useSceneWindow();
  const meta = useSceneMeta();
  // Callback ref as state — StepArrows must re-measure once the column
  // actually exists (a child's layout effect beats its parent's ref).
  const [stepsCol, setStepsCol] = React.useState<HTMLDivElement | null>(null);

  if (!slot) return null;
  const steps: MathStep[] = (slot.steps ?? []).filter(
    (s): s is MathStep => typeof s === 'object' && s !== null && typeof s.expr === 'string' && s.expr.trim() !== ''
  );
  if (steps.length === 0) return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  // The rule panel takes a column beside the working (a band under it in
  // portrait), so the steps have less room to typeset into.
  const rule = slot.rule && (slot.rule.name ?? '').trim() !== '' ? slot.rule : null;

  // ---- Type size: fit the widest expression AND the row count -------------
  const maxUnits = Math.max(...steps.map((s) => mathWidthUnits(parseMath(s.expr))), 6);
  const colWidth = (portrait ? 900 : rule ? 900 : 1240) * u;
  const byWidth = colWidth / (maxUnits * 0.6);
  const byHeight = ((portrait ? (rule ? 900 : 1150) : 660) * u) / (steps.length * 2.05);
  const exprSize = Math.max(30 * u, Math.min(60 * u, byWidth, byHeight));

  // ---- Pacing --------------------------------------------------------------
  // With real word timings each step lands where its share of the narration
  // BEGINS — the working tracks the voice through pauses and long sentences,
  // not a metronome. Without timings: even spread, all landed by ~75%.
  const firstAt = f30(fps, heading !== '' ? 20 : 12);
  const words = scene.narration_words ?? [];
  let landAt: number[];
  if (words.length >= steps.length && steps.length > 1) {
    const minGap = f30(fps, 8);
    const lastOk = Math.max(firstAt + minGap, durationInFrames * 0.85);
    landAt = steps.map((_, i) => {
      const w = words[Math.floor((i * words.length) / steps.length)];
      return Math.round((w?.start ?? 0) * fps);
    });
    // Clamp into the scene and keep the reveals readable: never before the
    // heading settles, never bunched tighter than 8f, never past 85%.
    landAt[0] = Math.max(firstAt, Math.min(landAt[0], lastOk));
    for (let i = 1; i < landAt.length; i++) {
      landAt[i] = Math.max(landAt[i - 1] + minGap, Math.min(landAt[i], lastOk));
    }
  } else {
    const lastBy = Math.max(firstAt + f30(fps, 8), durationInFrames * 0.75);
    const gap =
      steps.length > 1
        ? Math.max(f30(fps, 10), Math.min(f30(fps, 46), (lastBy - firstAt) / (steps.length - 1)))
        : 0;
    landAt = steps.map((_, i) => Math.round(firstAt + i * gap));
  }
  const stepAt = (i: number): number => landAt[i];
  const answerIdx = steps.length - 1;
  const answerAt = stepAt(answerIdx);
  const at = win?.start ?? 0;

  // Operation arrows (a term moving sides, a product distributing) need every
  // atom addressable in the DOM — atomMark turns that on, only when asked for.
  const hasArrows = steps.some((s) => (s.arrows ?? []).length > 0);
  const rowDim = (i: number): number =>
    i < answerIdx ? 1 - 0.42 * easeOutQuint(clamp01((frame - stepAt(i + 1)) / f30(fps, 8))) : 1;

  const row = (step: MathStep, i: number): React.ReactNode => {
    const local = frame - stepAt(i);
    const inP = easeOutQuint(clamp01(local / f30(fps, 12)));
    const noteP = easeOutQuint(clamp01((local - f30(fps, 5)) / f30(fps, 8)));
    const isAnswer = i === answerIdx && steps.length > 1;

    // Landed steps step back once the next line arrives — the working stays
    // readable but the newest move owns the eye.
    const dimP =
      i < answerIdx ? easeOutQuint(clamp01((frame - stepAt(i + 1)) / f30(fps, 8))) : 0;
    const dim = 1 - 0.42 * dimP;

    // Notes are prose, but writers slip math into them ("sqrt{121} = 11") —
    // the plain projection turns the notation into real glyphs.
    const note = mathToPlain(parseMath((step.note ?? '').trim()));
    const noteEl = note ? (
      <span
        style={{
          fontFamily: MONO_FONT,
          fontSize: Math.max(18 * u, exprSize * 0.34),
          letterSpacing: 1.2 * u,
          textTransform: 'uppercase',
          color: theme.muted,
          opacity: noteP,
          transform: `translateY(${(1 - noteP) * 8 * u}px)`,
          whiteSpace: 'nowrap',
        }}
      >
        {note}
      </span>
    ) : null;

    const exprEl = isAnswer ? (
      <AnswerChip
        expr={step.expr}
        size={exprSize}
        landFrame={local}
        fps={fps}
        accent={theme.accent}
        font={displayFont}
        u={u}
        atomMark={hasArrows ? `r${i}` : undefined}
      />
    ) : (
      <MathText
        expr={step.expr}
        color={theme.text}
        // The atoms that changed since the previous line take the accent —
        // the eye lands exactly on the move the note names.
        highlightFrom={i > 0 ? steps[i - 1].expr : null}
        highlightColor={theme.accent}
        atomMark={hasArrows ? `r${i}` : undefined}
        style={{ fontFamily: displayFont, fontWeight: 800, fontSize: exprSize, lineHeight: 1.2 }}
      />
    );

    return (
      <div
        key={i}
        style={{
          display: 'flex',
          flexDirection: portrait && note ? 'column' : 'row',
          alignItems: portrait && note ? 'flex-start' : 'center',
          gap: portrait ? 8 * u : 34 * u,
          opacity: inP === 0 ? 0 : dim,
          transform: `translateY(${(1 - inP) * 16 * u}px)`,
          clipPath: `inset(0 ${(1 - inP) * 100}% 0 0)`,
        }}
      >
        <span
          style={{
            fontFamily: MONO_FONT,
            fontSize: 22 * u,
            color: theme.muted,
            opacity: 0.7,
            minWidth: 44 * u,
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
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '6%', boxSizing: 'border-box' }}>
      {/* The stamp lands with the answer chip — one sound, the QED. */}
      {steps.length > 1 ? <SfxCue name="stamp" at={at + answerAt + f30(fps, 3)} volume={0.9} /> : null}

      <div style={{ width: '100%', maxWidth: (portrait ? 940 : 1420) * u }}>
        {kicker ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 24 * u,
              letterSpacing: 4 * u,
              textTransform: 'uppercase',
              color: theme.accent,
              marginBottom: 14 * u,
              opacity: headIn,
              transform: `translateY(${(1 - headIn) * 10 * u}px)`,
            }}
          >
            {kicker}
          </div>
        ) : null}
        {heading ? (
          <h1
            style={{
              margin: `0 0 ${44 * u}px 0`,
              fontFamily: displayFont,
              fontWeight: 900,
              fontSize: fitText(heading, {
                  width: width * (portrait ? 0.86 : 0.78),
                  max: 62 * u,
                  min: 32 * u,
                  maxLines: 2,
                  font: displayFont,
                  weight: 900,
                }),
              lineHeight: 1.05,
              color: theme.text,
            }}
          >
            <KineticText text={heading} highlight={meta.style?.highlight} />
          </h1>
        ) : null}

        <div
          style={{
            display: 'flex',
            flexDirection: portrait ? 'column' : 'row',
            alignItems: portrait ? 'stretch' : 'flex-start',
            gap: (portrait ? 40 : 56) * u,
          }}
        >
          <div
            ref={setStepsCol}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: Math.max(18 * u, exprSize * 0.55),
              position: 'relative',
            }}
          >
            {steps.map((s, i) => row(s, i))}
            {hasArrows ? (
              <StepArrows
                container={stepsCol}
                steps={steps}
                landAt={landAt}
                frame={frame}
                fps={fps}
                color={theme.accent}
                strokeWidth={Math.max(2.5, exprSize * 0.07)}
                dimOf={rowDim}
              />
            ) : null}
          </div>
          {rule ? (
            <RulePanel rule={rule} frame={frame} fps={fps} portrait={portrait} u={u} at={Math.max(0, firstAt - f30(fps, 6))} />
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * The rule panel: what the move is CALLED, the rule stated generally, and one
 * line on what it does. It lands after the first step so the viewer reads the
 * working first and the justification second — the order a teacher speaks in.
 * An accent rule bar ties it to the column; flat surfaces only.
 */
const RulePanel: React.FC<{
  rule: MathRule;
  frame: number;
  fps: number;
  portrait: boolean;
  u: number;
  /** The frame the panel lands at — BEFORE the first step: the viewer reads
   *  why the move is legal, then watches it happen (a teacher's order). */
  at: number;
}> = ({ rule, frame, fps, portrait, u, at }) => {
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const inP = easeOutQuint(clamp01((frame - at) / f30(fps, 12)));
  const formulaP = easeOutQuint(clamp01((frame - at - f30(fps, 6)) / f30(fps, 10)));
  const whyP = easeOutQuint(clamp01((frame - at - f30(fps, 14)) / f30(fps, 12)));

  const formula = (rule.formula ?? '').trim();
  const why = (rule.why ?? '').trim();

  // The formula is stated in full and must not wrap mid-expression ("log_b"
  // on one line and "(mn)" on the next reads as two things). Size it to the
  // panel the way the working sizes itself to its column.
  const panelW = (portrait ? 820 : 332) * u;
  const formulaSize = formula
    ? Math.max(19 * u, Math.min(32 * u, panelW / (mathWidthUnits(parseMath(formula)) * 0.56)))
    : 0;

  return (
    <div
      style={{
        width: portrait ? '100%' : 360 * u,
        flexShrink: 0,
        borderLeft: portrait ? undefined : `${3 * u}px solid ${theme.accent}`,
        borderTop: portrait ? `${3 * u}px solid ${theme.accent}` : undefined,
        paddingLeft: portrait ? 0 : 28 * u,
        paddingTop: portrait ? 22 * u : 0,
        opacity: inP,
        transform: `translateX(${(1 - inP) * (portrait ? 0 : 16) * u}px) translateY(${(1 - inP) * (portrait ? 12 : 0) * u}px)`,
      }}
    >
      <div
        style={{
          fontFamily: MONO_FONT,
          fontSize: 20 * u,
          letterSpacing: 3.5 * u,
          textTransform: 'uppercase',
          color: theme.accent,
          marginBottom: 12 * u,
        }}
      >
        The rule
      </div>
      <div
        style={{
          fontFamily: displayFont,
          fontWeight: 800,
          fontSize: 30 * u,
          lineHeight: 1.15,
          color: theme.text,
          marginBottom: formula ? 20 * u : 14 * u,
        }}
      >
        {rule.name}
      </div>
      {formula ? (
        <div
          style={{
            opacity: formulaP,
            transform: `translateY(${(1 - formulaP) * 8 * u}px)`,
            marginBottom: why ? 20 * u : 0,
          }}
        >
          <MathText
            expr={formula}
            color={theme.accent}
            style={{ fontFamily: displayFont, fontWeight: 800, fontSize: formulaSize, lineHeight: 1.25 }}
          />
        </div>
      ) : null}
      {why ? (
        <div
          style={{
            fontFamily: BODY_FONT,
            fontSize: 23 * u,
            lineHeight: 1.4,
            color: theme.muted,
            opacity: whyP,
            transform: `translateY(${(1 - whyP) * 8 * u}px)`,
          }}
        >
          {why}
        </div>
      ) : null}
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
  u: number;
  atomMark?: string;
}> = ({ expr, size, landFrame, fps, accent, font, u, atomMark }) => {
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
        padding: `${size * 0.22}px ${size * 0.42}px`,
        transform: `scale(${0.9 + 0.1 * Math.min(1.05, pop)})`,
        transformOrigin: 'left center',
        opacity: Math.min(1, pop * 1.4),
      }}
    >
      <MathText
        expr={expr}
        color={inkOn(accent)}
        atomMark={atomMark}
        style={{ fontFamily: font, fontWeight: 800, fontSize: size, lineHeight: 1.2 }}
      />
    </span>
  );
};
