import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene } from '../types';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';
import { MathText, InlineMathText, parseMath, mathWidthUnits } from '../math/mathText';
import { looksLikeProse } from '../math/prose';
import { KineticText } from '../components/KineticText';
import { SfxCue } from '../sfx';

/**
 * practice_card — the "now you try one" beat.
 *
 * The kicker reads YOUR TURN, the problem lands large, an optional hint settles
 * under it, and then an accent PAUSE BAR runs across the frame while the viewer
 * works — the one moment in the video where nothing new is being said is made
 * visible, so a pause reads as an invitation rather than dead air. When the bar
 * completes the answer stamps in on an accent chip in its place.
 *
 * The reveal follows the narration: it lands on the word that gives the answer
 * away ("the answer is…"), clamped so the viewer always gets real working time
 * and the answer never falls off the end of the scene.
 *
 * The card does not check the answer and must not: the validator has already
 * substituted numeric answers back into the problem and refused to send one
 * that fails, so anything that arrives here is either verified or unverifiable
 * by construction. Flat law: hairline track, solid accent fill, no panel behind
 * the problem. ONE stamp cue on the reveal (§1.3).
 */
export const PracticeCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_practice'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const win = useSceneWindow();
  const meta = useSceneMeta();

  if (!slot) return null;

  const prompt = (slot.prompt ?? '').trim();
  const answer = (slot.answer ?? '').trim();
  if (prompt === '' || answer === '') return null;

  const portrait = height > width;
  const hint = (slot.hint ?? '').trim();
  const heading = (slot.heading ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim() || 'Your turn';

  // ---- Timing: land, work, reveal -----------------------------------------
  const total = Math.max(1, Math.round((scene.duration_seconds || 10) * fps));
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 10)));
  const promptAt = f30(fps, 12);
  const hintAt = promptAt + f30(fps, 16);
  const barAt = hintAt + f30(fps, 6);

  /*
   * The give-away word. Searched only in the back half of the narration: an
   * "answer" in the setup ("here's a problem — work out the answer") is the
   * question being asked, not the answer being given. The clamps matter more
   * than the match: never before the viewer has had real time to work
   * (the later of 45% and ~2s after the bar starts), never past 82% or the
   * payoff is cut off with the scene.
   */
  const revealAt = (() => {
    const floor = Math.max(Math.round(total * 0.45), barAt + f30(fps, 46));
    const ceil = Math.max(floor + f30(fps, 8), Math.round(total * 0.82));
    const words = scene.narration_words ?? [];
    const tell = /^(answer|answers|solution|solutions|got|equals|correct)$/;
    for (let i = Math.floor(words.length * 0.45); i < words.length; i++) {
      const w = (words[i].word ?? '').toLowerCase().replace(/[^a-z]/g, '');
      if (tell.test(w)) {
        return Math.min(Math.max(Math.round(words[i].start * fps), floor), ceil);
      }
    }
    return Math.min(Math.max(Math.round(total * 0.62), floor), ceil);
  })();

  const promptIn = easeOutQuint(clamp01((frame - promptAt) / f30(fps, 12)));
  const hintIn = easeOutQuint(clamp01((frame - hintAt) / f30(fps, 10)));
  // The bar tracks real time to the reveal, so its fill IS the working window.
  const barP = clamp01((frame - barAt) / Math.max(1, revealAt - barAt));
  const barOut = easeOutQuint(clamp01((frame - revealAt) / f30(fps, 7)));
  const answerLocal = frame - revealAt;
  const captionIn = easeOutQuint(clamp01((frame - revealAt - f30(fps, 12)) / f30(fps, 10)));

  // ---- Type sizes: deterministic, no measure pass ---------------------------
  const colW = (portrait ? 900 : 1240) * u;
  const prose = looksLikeProse(prompt);
  // The problem is the hero of the frame, so it runs large — except when it
  // stacks: a fraction is two lines plus a bar, and at hero size it would eat
  // the band the answer has to land in.
  const stacked = /frac\{|sqrt\{/.test(prompt);
  const promptFs = prose
    ? (prompt.length > 70 ? 46 : prompt.length > 45 ? 54 : 62) * u * (portrait ? 0.86 : 1)
    : Math.max(
        30 * u,
        Math.min((stacked ? 62 : 84) * u, colW / (mathWidthUnits(parseMath(prompt)) * 0.6))
      );
  const answerFs = Math.max(
    28 * u,
    Math.min(promptFs * 0.86, 68 * u, colW / (mathWidthUnits(parseMath(answer)) * 0.62))
  );
  const metaFs = (portrait ? 23 : 25) * u;
  // The bar and the answer share one reserved band, so the problem above it
  // never shifts when the answer arrives.
  const bandH = answerFs * 2.1;
  const at = win?.start ?? 0;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '6%', boxSizing: 'border-box' }}>
      <SfxCue name="stamp" at={at + revealAt + f30(fps, 2)} volume={0.9} />

      <div style={{ width: portrait ? '96%' : '82%', textAlign: 'center' }}>
        <div style={{ marginBottom: 22 * u, opacity: headIn }}>
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 24 * u,
              fontWeight: 700,
              letterSpacing: 4 * u,
              textTransform: 'uppercase',
              color: theme.accent,
              marginBottom: heading ? 12 * u : 0,
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
                fontSize: fitText(heading, {
                  width: width * (portrait ? 0.86 : 0.78),
                  max: 48 * u,
                  min: 25 * u,
                  maxLines: 2,
                  font: displayFont,
                  weight: 900,
                }),
                lineHeight: 1.06,
                color: theme.text,
              }}
            >
              <KineticText text={heading} highlight={meta.style?.highlight} />
            </h1>
          ) : null}
        </div>

        {/* The problem. */}
        <div
          style={{
            opacity: promptIn,
            transform: `translateY(${(1 - promptIn) * 14 * u}px)`,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          {prose ? (
            <div
              style={{
                fontFamily: displayFont,
                fontWeight: 800,
                fontSize: promptFs,
                lineHeight: 1.24,
                color: theme.text,
              }}
            >
              {/* Worded problems still quote notation ("a rope of length
                  sqrt{50} m"), and this branch is chosen precisely because the
                  line is a SENTENCE — InlineMathText typesets the math inside
                  it without giving up prose wrapping. */}
              <InlineMathText text={prompt} />
            </div>
          ) : (
            <MathText
              expr={prompt}
              color={theme.text}
              style={{ fontFamily: displayFont, fontWeight: 800, fontSize: promptFs, lineHeight: 1.2 }}
            />
          )}
        </div>

        {hint ? (
          <div
            style={{
              marginTop: 22 * u,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'baseline',
              gap: 12 * u,
              flexWrap: 'wrap',
              opacity: hintIn,
              transform: `translateY(${(1 - hintIn) * 8 * u}px)`,
            }}
          >
            <span
              style={{
                fontFamily: MONO_FONT,
                fontSize: metaFs * 0.8,
                letterSpacing: 2.6 * u,
                textTransform: 'uppercase',
                color: theme.accent,
              }}
            >
              Hint
            </span>
            <span style={{ fontFamily: BODY_FONT, fontSize: metaFs, lineHeight: 1.35, color: theme.muted }}>
              {/* A hint is prose that usually carries a formula ("plug a, b, c
                  into x = (-b +- sqrt{b^2-4ac})/(2a)") — InlineMathText draws
                  the powers and the radical while still wrapping as a
                  sentence. Raw, the notation showed as source. */}
              <InlineMathText text={hint} />
            </span>
          </div>
        ) : null}

        {/* The working window, then the answer — one reserved band. */}
        <div
          style={{
            marginTop: 40 * u,
            height: bandH,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14 * u,
              opacity: (1 - barOut) * easeOutQuint(clamp01((frame - barAt) / f30(fps, 8))),
            }}
          >
            <div
              style={{
                fontFamily: MONO_FONT,
                fontSize: metaFs * 0.84,
                letterSpacing: 3.4 * u,
                textTransform: 'uppercase',
                color: theme.muted,
              }}
            >
              Pause and try it
            </div>
            <div style={{ width: portrait ? '72%' : '46%', height: Math.max(4, 5 * u), background: hairline(theme, 0.5) }}>
              <div style={{ width: `${barP * 100}%`, height: '100%', background: theme.accent }} />
            </div>
          </div>

          <AnswerStamp
            answer={answer}
            size={answerFs}
            local={answerLocal}
            fps={fps}
            u={u}
            accent={theme.accent}
            font={displayFont}
            metaFs={metaFs}
          />
        </div>

        {caption ? (
          <div
            style={{
              marginTop: 26 * u,
              fontFamily: MONO_FONT,
              fontSize: metaFs * 0.9,
              letterSpacing: 1.2 * u,
              color: theme.muted,
              opacity: captionIn,
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/** The payoff: an ANSWER eyebrow over a solid accent chip that pops as it lands. */
const AnswerStamp: React.FC<{
  answer: string;
  size: number;
  local: number;
  fps: number;
  u: number;
  accent: string;
  font: string;
  metaFs: number;
}> = ({ answer, size, local, fps, u, accent, font, metaFs }) => {
  const pop = spring({
    frame: Math.max(0, local),
    fps,
    config: SPRINGS.pop,
    durationInFrames: Math.round(fps * 0.4),
  });
  if (local < 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10 * u,
        opacity: Math.min(1, pop * 1.4),
      }}
    >
      <div
        style={{
          fontFamily: MONO_FONT,
          fontSize: metaFs * 0.84,
          letterSpacing: 3.4 * u,
          textTransform: 'uppercase',
          color: accent,
        }}
      >
        Answer
      </div>
      <span
        style={{
          display: 'inline-flex',
          background: accent,
          padding: `${size * 0.2}px ${size * 0.4}px`,
          transform: `scale(${0.9 + 0.1 * Math.min(1.05, pop)})`,
        }}
      >
        <MathText
          expr={answer}
          color={inkOn(accent)}
          style={{ fontFamily: font, fontWeight: 800, fontSize: size, lineHeight: 1.2 }}
        />
      </span>
    </div>
  );
};
