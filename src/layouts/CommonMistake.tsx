import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { IconStroke } from '../icons/IconStroke';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeOutCubic, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { MathText, parseMath, mathWidthUnits } from '../math/mathText';
import { looksLikeProse } from '../math/prose';
import { KineticText } from '../components/KineticText';
import { SfxCue } from '../sfx';

/**
 * common_mistake — the trap beat.
 *
 * The line people actually write lands first, straight, with a muted cross;
 * at the narration's turn ("but you can't…", "actually…") a strike draws
 * through it, it steps back, and the correct line stamps in below on an accent
 * rule with a tick. One plain sentence names the error last.
 *
 * Both lines are TYPESET as working, at the same size, stacked — so the eye
 * compares the move itself rather than two paragraphs about it. The size is
 * solved from the wider of the two, which is why they never disagree.
 *
 * On-palette per the flat law and myth_fact's precedent: the wrong line is
 * MUTED and the right one takes the accent — never a red/green flood. ONE
 * stamp cue, on the correction (§1.3).
 */
export const CommonMistake: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_mistake'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const win = useSceneWindow();
  const meta = useSceneMeta();

  if (!slot) return null;

  const wrong = (slot.wrong ?? '').trim();
  const right = (slot.correct ?? '').trim();
  if (wrong === '' || right === '') return null;

  const portrait = height > width;
  const why = (slot.why ?? '').trim();
  const heading = (slot.heading ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim() || 'Common mistake';

  // ---- Timing: the wrong line, the turn, the correction --------------------
  const total = Math.max(1, Math.round((scene.duration_seconds || 8) * fps));
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 10)));
  const wrongAt = f30(fps, 14);

  /*
   * The turn. Searched from a fifth in, so a "wrong" in the setup sentence
   * ("here is where people go wrong") does not fire the strike before the
   * line it strikes has even landed. Clamped to leave the wrong line time to
   * be READ — a correction that arrives before the viewer has taken in the
   * error corrects nothing — and to leave the fix time on screen.
   */
  const pivot = (() => {
    const words = scene.narration_words ?? [];
    const turn = /^(actually|but|however|instead|wrong|never|cannot|cant|correct|correctly|really|truth)$/;
    const floor = wrongAt + f30(fps, 34);
    const ceil = Math.max(floor + f30(fps, 8), Math.round(total * 0.72));
    for (let i = Math.floor(words.length * 0.2); i < words.length; i++) {
      const w = (words[i].word ?? '').toLowerCase().replace(/[^a-z]/g, '');
      if (turn.test(w)) {
        return Math.min(Math.max(Math.round(words[i].start * fps), floor), ceil);
      }
    }
    return Math.min(Math.max(Math.round(total * 0.44), floor), ceil);
  })();
  const rightAt = pivot + f30(fps, 8);

  const wrongIn = easeOutQuint(clamp01((frame - wrongAt) / f30(fps, 12)));
  const crossP = clamp01((frame - wrongAt - f30(fps, 6)) / f30(fps, 8));
  const strikeP = easeOutCubic(clamp01((frame - pivot) / f30(fps, 9)));
  const dimP = easeOutCubic(clamp01((frame - pivot) / f30(fps, 14)));
  const rightIn = easeOutQuint(clamp01((frame - rightAt) / f30(fps, 12)));
  const tickP = clamp01((frame - rightAt - f30(fps, 4)) / f30(fps, 8));
  const whyIn = easeOutQuint(clamp01((frame - rightAt - f30(fps, 14)) / f30(fps, 12)));

  // ---- One type size for BOTH lines, solved from the wider ------------------
  const colW = (portrait ? 820 : 1080) * u;
  const proseLines = looksLikeProse(wrong) || looksLikeProse(right);
  const widest = Math.max(
    mathWidthUnits(parseMath(wrong)),
    mathWidthUnits(parseMath(right)),
    6
  );
  const stacked = /frac\{|sqrt\{/.test(wrong) || /frac\{|sqrt\{/.test(right);
  const lineFs = proseLines
    ? (Math.max(wrong.length, right.length) > 40 ? 34 : 40) * u * (portrait ? 0.9 : 1)
    : Math.max(26 * u, Math.min((stacked ? 46 : 58) * u, colW / (widest * 0.6)));
  const markSize = Math.max(34 * u, lineFs * 0.78);
  const metaFs = (portrait ? 23 : 25) * u;

  const line = (text: string, color: string): React.ReactNode =>
    proseLines ? (
      <span style={{ fontFamily: displayFont, fontWeight: 800, fontSize: lineFs, lineHeight: 1.25, color }}>
        {text}
      </span>
    ) : (
      <MathText
        expr={text}
        color={color}
        style={{ fontFamily: displayFont, fontWeight: 800, fontSize: lineFs, lineHeight: 1.25 }}
      />
    );

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '7%', boxSizing: 'border-box' }}>
      {/* One landmark: the correction landing. */}
      <SfxCue name="stamp" at={(win?.start ?? 0) + rightAt} volume={0.7} />

      {/* The block hugs its own content (inline-block) rather than filling the
          frame: the two lines must share a left edge so the eye can diff them,
          and a full-width box would leave that pair stranded on the left with
          a centred heading floating above it. */}
      <div style={{ display: 'inline-block', maxWidth: (portrait ? 900 : 1300) * u }}>
        <div style={{ textAlign: 'center', marginBottom: 40 * u, opacity: headIn }}>
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 24 * u,
              fontWeight: 700,
              letterSpacing: 4 * u,
              textTransform: 'uppercase',
              color: theme.accent,
              marginBottom: heading ? 14 * u : 0,
            }}
          >
            {kicker}
          </div>
          {heading ? (
            <h1
              style={{
                margin: 0,
                fontFamily: displayFont,
                fontWeight: 900,
                fontSize: (portrait ? 46 : 54) * u,
                lineHeight: 1.06,
                color: theme.text,
              }}
            >
              <KineticText text={heading} highlight={meta.style?.highlight} />
            </h1>
          ) : null}
        </div>

        {/* THE TRAP — landed straight, then struck through. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24 * u,
            opacity: wrongIn * (1 - dimP * 0.42),
            transform: `translateY(${(1 - wrongIn) * 16 * u}px)`,
          }}
        >
          <div style={{ flexShrink: 0, width: markSize, height: markSize }}>
            <IconStroke name="x" progress={crossP} size={markSize} color={theme.muted} strokeWidth={2.6} />
          </div>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            {line(wrong, theme.text)}
            {/* The strike rides the line's own box, so it crosses exactly the
                width of what was written — including a stacked fraction. */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: '50%',
                width: '100%',
                height: Math.max(3, 4 * u),
                background: theme.muted,
                transformOrigin: 'left',
                transform: `scaleX(${strikeP})`,
              }}
            />
          </div>
        </div>

        {/* THE FIX — stamps in under an accent rule. */}
        <div
          style={{
            marginTop: 34 * u,
            display: 'flex',
            alignItems: 'center',
            gap: 24 * u,
            paddingLeft: 22 * u,
            borderLeft: `${6 * u}px solid ${theme.accent}`,
            opacity: rightIn,
            transform: `translateY(${(1 - rightIn) * 18 * u}px)`,
          }}
        >
          <div style={{ flexShrink: 0, width: markSize, height: markSize }}>
            <IconStroke name="check" progress={tickP} size={markSize} color={theme.accent} strokeWidth={2.8} />
          </div>
          {line(right, theme.text)}
        </div>

        {/* What actually went wrong, in words. */}
        {why ? (
          <div
            style={{
              marginTop: 34 * u,
              paddingLeft: 28 * u,
              fontFamily: BODY_FONT,
              fontSize: metaFs * 1.12,
              lineHeight: 1.4,
              color: theme.muted,
              opacity: whyIn,
              transform: `translateY(${(1 - whyIn) * 8 * u}px)`,
            }}
          >
            {why}
          </div>
        ) : null}

        {caption ? (
          <div
            style={{
              marginTop: 22 * u,
              paddingLeft: 28 * u,
              fontFamily: MONO_FONT,
              fontSize: metaFs * 0.88,
              letterSpacing: 1.2 * u,
              color: theme.muted,
              opacity: easeOutQuint(clamp01((frame - rightAt - f30(fps, 22)) / f30(fps, 10))),
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
