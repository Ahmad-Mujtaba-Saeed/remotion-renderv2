import React from 'react';
import { useVideoConfig, spring } from 'remotion';
import { Scene, MathStep } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useTheme, useDisplayFont, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { clamp01, easeOutQuint } from '../motion/easing';
import { SPRINGS } from '../motion/springs';
import { MathText, InlineMathText, parseMath, mathToPlain, mathWidthUnits } from '../math/mathText';
import { StepArrows } from '../math/StepArrows';
import { equationSteps, equationLandAt } from './equationPacing';
import { EQ_WIDTH_BUDGET, EQ_EXTRA_UNITS, EQ_MIN_UNITS } from './boardLayout';

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
export const BoardEquation: React.FC<{
  scene: Scene;
  boxW: number;
  boxH: number;
  /**
   * Width units of the LONGEST line anywhere on the board (MathBoard computes
   * it once). Real handwriting has ONE size for the whole working — a card
   * that sizes its own type turns a short line like "5 - 1" into a headline.
   */
  globalMaxUnits?: number;
}> = ({ scene, boxW, boxH, globalMaxUnits }) => {
  const slot = scene.slots?.['slot_math'] ?? Object.values(scene.slots ?? {})[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const { fps } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();

  const steps: MathStep[] = equationSteps(scene);
  if (steps.length === 0) return null;

  const heading = (slot?.heading ?? '').toString().trim();
  const kicker = (scene.style?.kicker ?? slot?.label ?? '').toString().trim();
  // The rule this chunk of working applies — a strip written onto the board
  // under the heading, because the margins are off-camera at reading zoom.
  // boardLayout budgets its height (boardHasRule), so the box already fits it.
  const mathRule = slot?.rule && (slot.rule.name ?? '').trim() !== '' ? slot.rule : null;
  const hasArrows = steps.some((s) => (s.arrows ?? []).length > 0);
  // Callback ref as state — see MathSteps: the arrows overlay must re-measure
  // once the rows column actually exists.
  const [rowsEl, setRowsEl] = React.useState<HTMLDivElement | null>(null);

  // ---- Type sizing off the box --------------------------------------------
  const headH = heading ? boxH * 0.2 : 0;
  const kickH = kicker ? boxH * 0.07 : 0;
  const ruleH = mathRule ? boxH * 0.18 : 0;
  const rowGap = boxH * 0.03;
  const rowZone = boxH - headH - kickH - ruleH;
  // The inter-row gaps must come OUT of the row budget: unbudgeted, an
  // 8-step card ran ~0.2×boxH past its box and bled onto the card below it.
  const rowH = (rowZone - rowGap * (steps.length - 1)) / (steps.length + 0.3);
  const ownMaxUnits = Math.max(...steps.map((s) => mathWidthUnits(parseMath(s.expr))), 6);
  // Board-wide size: every card measures against the LONGEST line on the
  // whole board (min units so a board of short lines still isn't shouted).
  // The budget subtracts the row's chrome (number column, gap, answer-chip
  // padding) so a full row can never spill past the box — the old expr-only
  // fit is what pushed long lines off screen in 9:16.
  const maxUnits = Math.max(globalMaxUnits ?? ownMaxUnits, EQ_MIN_UNITS);
  const byWidth = (boxW * EQ_WIDTH_BUDGET) / (maxUnits * 0.6 + EQ_EXTRA_UNITS);
  const exprSize = Math.max(boxH * 0.04, Math.min(rowH * 0.5, byWidth));
  const rule = Math.max(1, boxW * 0.0016);

  // ---- Pacing: land each line where its share of the narration begins ------
  // (equationPacing — shared with boardLayout's camera, which follows the
  // write-head using the same land times.)
  const f = (n: number): number => Math.round((n / 30) * fps);
  const firstAt = f(heading ? 20 : 12);
  const landAt = equationLandAt(scene, durationInFrames, fps);
  const answerIdx = steps.length - 1;
  const headIn = easeOutQuint(clamp01(frame / f(12)));
  // The rule lands just BEFORE the first line — why the move is legal, then
  // the move.
  const ruleIn = easeOutQuint(clamp01((frame - Math.max(0, firstAt - f(6))) / f(12)));
  const rowDim = (i: number): number =>
    i < answerIdx ? 1 - 0.45 * easeOutQuint(clamp01((frame - landAt[i + 1]) / f(8))) : 1;

  const row = (step: MathStep, i: number): React.ReactNode => {
    const local = frame - landAt[i];
    const inP = easeOutQuint(clamp01(local / f(12)));
    const noteP = easeOutQuint(clamp01((local - f(5)) / f(8)));
    const isAnswer = i === answerIdx && steps.length > 1;
    const dimP = i < answerIdx ? easeOutQuint(clamp01((frame - landAt[i + 1]) / f(8))) : 0;
    const dim = 1 - 0.45 * dimP;

    // ONE annotation per line. When a line carries a citation, the note is
    // suppressed: the note only names the move ("start with the equation")
    // while the citation says WHY it is allowed, and squeezing both into the
    // row left the note wrapping into a four-line stack beside the maths.
    const ref = (step.ref ?? '').toString().trim();
    const note = ref ? '' : mathToPlain(parseMath((step.note ?? '').toString().trim()));
    const noteEl = note ? (
      <span
        style={{
          fontFamily: MONO_FONT,
          fontSize: Math.max(exprSize * 0.32, boxH * 0.028),
          letterSpacing: boxW * 0.0012,
          textTransform: 'uppercase',
          color: theme.muted,
          opacity: noteP,
          // Wrap, never overflow: a long move name pushed the row past the
          // box on narrow (9:16) boards when it refused to break.
          minWidth: 0,
          flex: '0 1 auto',
        }}
      >
        {note}
      </span>
    ) : null;

    // The "as we know…" citation, pinned to the right margin of the row and
    // written a beat AFTER the line lands — the lecturer states the move, then
    // justifies it. Typeset (not plain) so an identity renders as maths.
    const refP = easeOutQuint(clamp01((local - f(8)) / f(10)));
    const refEl = ref ? (
      <span
        style={{
          // Out of flex flow: the citation lives in the margin the board-wide
          // sizing reserved for it (EQ_REF_UNITS) and can never squeeze or
          // wrap the equation it annotates.
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          maxWidth: '36%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: exprSize * 0.1,
          // A hairline tying the citation to its line, the way a lecturer
          // brackets the margin note against the step it belongs to.
          borderLeft: `${Math.max(2, exprSize * 0.05)}px solid ${theme.accent}`,
          paddingLeft: exprSize * 0.3,
          opacity: refP,
        }}
      >
        <span
          style={{
            fontFamily: MONO_FONT,
            fontSize: Math.max(exprSize * 0.3, boxH * 0.026),
            textTransform: 'uppercase',
            letterSpacing: boxW * 0.0012,
            color: theme.accent,
            whiteSpace: 'nowrap',
          }}
        >
          ∵ as we know
        </span>
        <MathText
          expr={ref}
          color={theme.text}
          style={{
            fontFamily: displayFont,
            fontWeight: 800,
            // Was ~0.36 of the line and read as fine print against 800-weight
            // maths. The citation is the teaching content of the row, so it
            // gets a real size — half the working line, on its own row under
            // the label rather than squeezed beside it.
            fontSize: Math.max(exprSize * 0.52, boxH * 0.04),
            lineHeight: 1.15,
          }}
        />
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
        atomMark={hasArrows ? `r${i}` : undefined}
      />
    ) : (
      <MathText
        expr={step.expr}
        color={theme.text}
        highlightFrom={i > 0 ? steps[i - 1].expr : null}
        highlightColor={theme.accent}
        atomMark={hasArrows ? `r${i}` : undefined}
        style={{ fontFamily: displayFont, fontWeight: 800, fontSize: exprSize, lineHeight: 1.15 }}
      />
    );

    return (
      <div key={i} style={{ position: 'relative', minHeight: rowH, display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: boxW * 0.03,
            width: '100%',
            // Keep the row's own content out of the citation's margin. The ref
            // is absolutely positioned at the right edge, so without this a
            // long note ran underneath it and the two overlapped.
            paddingRight: ref ? '38%' : 0,
            boxSizing: 'border-box',
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
        {/* Outside the clipped layer, like the pen tip: the citation fades in
            on its own beat instead of waiting for the write-on to sweep past
            it. */}
        {refEl}
        {/* The pen tip: a small accent dot riding the write-on edge — the
            attention cue the whiteboard-lecture research keeps finding (the
            eye follows the hand). Sits OUTSIDE the clipped layer so it leads
            the reveal rather than being eaten by it. */}
        {inP > 0.02 && inP < 0.99 ? (
          <span
            style={{
              position: 'absolute',
              left: `${inP * 92}%`,
              top: '50%',
              width: exprSize * 0.16,
              height: exprSize * 0.16,
              borderRadius: '50%',
              background: theme.accent,
              transform: 'translateY(-50%)',
            }}
          />
        ) : null}
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
      {mathRule ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: boxW * 0.02,
            borderLeft: `${Math.max(2, boxW * 0.004)}px solid ${theme.accent}`,
            paddingLeft: boxW * 0.018,
            margin: `${boxH * 0.015}px 0 ${boxH * 0.02}px`,
            opacity: ruleIn,
            transform: `translateY(${(1 - ruleIn) * boxH * 0.015}px)`,
          }}
        >
          <span
            style={{
              fontFamily: MONO_FONT,
              fontSize: boxH * 0.032,
              letterSpacing: boxW * 0.0025,
              textTransform: 'uppercase',
              color: theme.accent,
            }}
          >
            {mathRule.name}
          </span>
          {(mathRule.formula ?? '').trim() ? (
            <MathText
              expr={(mathRule.formula ?? '').trim()}
              color={theme.accent}
              style={{ fontFamily: displayFont, fontWeight: 800, fontSize: boxH * 0.05 }}
            />
          ) : null}
          {(mathRule.why ?? '').trim() ? (
            <span
              style={{
                fontFamily: BODY_FONT,
                fontSize: boxH * 0.036,
                color: theme.muted,
                flexBasis: '100%',
              }}
            >
              {(mathRule.why ?? '').trim()}
            </span>
          ) : null}
        </div>
      ) : null}
      <div ref={setRowsEl} style={{ display: 'flex', flexDirection: 'column', gap: rowGap, position: 'relative' }}>
        {steps.map((s, i) => row(s, i))}
        {hasArrows ? (
          <StepArrows
            container={rowsEl}
            steps={steps}
            landAt={landAt}
            frame={frame}
            fps={fps}
            color={theme.accent}
            strokeWidth={Math.max(2, exprSize * 0.07)}
            dimOf={rowDim}
          />
        ) : null}
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
  atomMark?: string;
}> = ({ expr, size, landFrame, fps, accent, font, atomMark }) => {
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
        atomMark={atomMark}
        style={{ fontFamily: font, fontWeight: 800, fontSize: size, lineHeight: 1.15 }}
      />
    </span>
  );
};
