import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeInOutSine, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { KineticText } from '../components/KineticText';

/**
 * term_card — the beat where the script stops to define a word.
 *
 * A dictionary entry at full-frame scale: the word lands large with an accent
 * underline drawing beneath it, the pronunciation and part of speech settle
 * under that, a hairline rule sweeps across, and the one-sentence definition
 * arrives last. The order is the point — you hear the word, learn to say it,
 * then find out what it means.
 *
 * Everything is data and time; there is no measure pass and no layout that can
 * collide, so the card is deterministic at any aspect. Flat law: hairline rule,
 * solid accent underline, no panel behind the text. Silent per §1.3.
 */
export const TermCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_term'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;

  const term = (slot.term ?? '').trim();
  const definition = (slot.definition ?? '').trim();
  if (term === '' || definition === '') return null;

  const portrait = height > width;
  const phonetic = (slot.phonetic ?? '').trim();
  const pos = (slot.part_of_speech ?? '').trim();
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const caption = (slot.caption ?? '').trim();

  // ---- Choreography: word → underline → sound → rule → meaning -------------
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 10)));
  const termIn = easeOutQuint(clamp01((frame - f30(fps, 4)) / f30(fps, 12)));
  const ruleP = easeInOutSine(clamp01((frame - f30(fps, 14)) / f30(fps, 14)));
  const soundIn = easeOutQuint(clamp01((frame - f30(fps, 20)) / f30(fps, 10)));
  const sepP = easeInOutSine(clamp01((frame - f30(fps, 30)) / f30(fps, 14)));
  const defIn = easeOutQuint(clamp01((frame - f30(fps, 38)) / f30(fps, 14)));

  /*
   * The term is the largest thing on screen, so it is the one that can
   * overflow. Long words step down through fixed sizes rather than being
   * measured — a deterministic ladder keeps the card identical every render.
   */
  const termFs =
    (term.length > 22 ? 74 : term.length > 15 ? 92 : term.length > 9 ? 112 : 132) *
    u *
    (portrait ? 0.72 : 1);
  const defFs = (portrait ? 30 : 33) * u;
  const metaFs = (portrait ? 25 : 27) * u;
  const contentW = portrait ? '92%' : '74%';

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '6%', boxSizing: 'border-box' }}>
      <div style={{ width: contentW, textAlign: 'center' }}>
        {kicker || heading ? (
          <div style={{ marginBottom: 26 * u, opacity: headIn }}>
            {kicker ? (
              <div
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 24 * u,
                  letterSpacing: 4 * u,
                  textTransform: 'uppercase',
                  color: theme.accent,
                  marginBottom: heading ? 12 * u : 0,
                }}
              >
                {kicker}
              </div>
            ) : null}
            {heading ? (
              <div
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: metaFs,
                  letterSpacing: 1.6 * u,
                  color: theme.muted,
                }}
              >
                {heading}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* The word itself, with an accent underline drawing beneath it. */}
        <div style={{ display: 'inline-block', position: 'relative' }}>
          <h1
            style={{
              margin: 0,
              fontFamily: displayFont,
              fontWeight: 900,
              fontSize: termFs,
              lineHeight: 1.02,
              color: theme.text,
              opacity: termIn,
              transform: `translateY(${(1 - termIn) * 14 * u}px)`,
              wordBreak: 'break-word',
            }}
          >
            <KineticText text={term} highlight={meta.style?.highlight} />
          </h1>
          <div
            style={{
              height: Math.max(4, 5 * u),
              marginTop: 10 * u,
              width: `${ruleP * 100}%`,
              background: theme.accent,
            }}
          />
        </div>

        {/* How it sounds, and what kind of word it is. */}
        {phonetic || pos ? (
          <div
            style={{
              marginTop: 20 * u,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'baseline',
              gap: 16 * u,
              flexWrap: 'wrap',
              opacity: soundIn,
            }}
          >
            {phonetic ? (
              <span style={{ fontFamily: MONO_FONT, fontSize: metaFs, color: theme.muted, letterSpacing: 1.2 * u }}>
                {phonetic}
              </span>
            ) : null}
            {pos ? (
              <span
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: metaFs * 0.86,
                  color: theme.accent,
                  letterSpacing: 2.4 * u,
                  textTransform: 'uppercase',
                }}
              >
                {pos}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Hairline separator, then the meaning. */}
        <div
          style={{
            height: Math.max(1.5, 1.6 * u),
            width: `${sepP * 100}%`,
            margin: `${30 * u}px auto ${28 * u}px`,
            background: hairline(theme, 0.45),
          }}
        />

        <div
          style={{
            fontFamily: BODY_FONT,
            fontSize: defFs,
            fontWeight: 500,
            lineHeight: 1.42,
            color: theme.text,
            opacity: defIn,
            transform: `translateY(${(1 - defIn) * 10 * u}px)`,
          }}
        >
          {definition}
        </div>

        {caption ? (
          <div
            style={{
              marginTop: 24 * u,
              fontFamily: MONO_FONT,
              fontSize: metaFs * 0.92,
              letterSpacing: 1.2 * u,
              color: theme.muted,
              opacity: easeOutQuint(clamp01((frame - f30(fps, 50)) / f30(fps, 12))),
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
