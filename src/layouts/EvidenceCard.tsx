import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01 } from '../motion/easing';
import { f30, idleScale } from '../motion/choreo';
import { useCardReveal } from '../motion/cardReveal';
import { KineticText } from '../components/KineticText';

/**
 * evidence_card — the "according to..." beat, drawn as a citation the viewer
 * can trust. The finding lands as the headline (a blockquote against an accent
 * rule, its words arriving as the narration speaks them) and the provenance is
 * cited beneath it like a reference someone could go and check.
 *
 * This card is the constructive counterpart of the no_source lint. The
 * validator only lets it render when the `source` actually NAMES someone — a
 * finding with no nameable source degrades to a plain text beat upstream — so
 * by the time a scene reaches this layout the attribution is real and the
 * citation frame is earned. There is no "unsourced" branch here on purpose:
 * refusing to fabricate provenance is the validator's job, not the renderer's.
 *
 * Deterministic beyond the type solver and KineticText's own word entrance.
 * Flat law: solid fills, one hairline rule, no shadows. Silent per §1.3.
 */
export const EvidenceCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_evidence'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();
  const reveal = useCardReveal();

  if (!slot) return null;

  const finding = (slot.finding ?? '').trim();
  const source = (slot.source ?? '').trim();
  // Guaranteed present by the validator; a defensive gate keeps a hand-edited
  // storyboard from rendering an empty citation frame.
  if (finding === '' || source === '') return null;

  const portrait = height > width;
  const year = (slot.year ?? '').trim();
  const sample = (slot.sample ?? '').trim();
  const heading = (slot.heading ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim() || 'According to';

  const headIn = reveal.ease(clamp01(frame / reveal.headFrames));

  // The provenance stamps in after the finding has mostly arrived — longer
  // findings hold it back a little further so the attribution never lands on a
  // half-spoken quote. Bounded so a short finding does not wait forever.
  const findingWords = finding.split(/\s+/).filter(Boolean).length;
  const attributionAt = f30(fps, 14) + Math.min(f30(fps, 48), Math.round(findingWords * 2.2 * (fps / 30)));
  const attrIn = spring({
    frame: Math.max(0, frame - attributionAt),
    fps,
    config: reveal.config,
    durationInFrames: reveal.popFrames,
  });

  const stageW = width * (portrait ? 0.86 : 0.68);
  const railW = Math.max(5, 6 * u);
  const railPad = 30 * u;
  const findW = stageW - railW - railPad;
  const findFs = fitText(finding, {
    width: findW,
    max: (portrait ? 46 : 54) * u,
    min: 24 * u,
    maxLines: portrait ? 6 : 5,
    font: displayFont,
    weight: 800,
    kinetic: true,
  });

  const chip = (text: string, key: string) => (
    <span
      key={key}
      style={{
        display: 'inline-block',
        padding: `${5 * u}px ${12 * u}px`,
        border: `${Math.max(1, 1.4 * u)}px solid ${hairline(theme, 0.34)}`,
        fontFamily: MONO_FONT,
        fontSize: 20 * u,
        fontWeight: 700,
        letterSpacing: 0.6 * u,
        color: theme.muted,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );

  return (
    <AbsoluteFill
      style={{ justifyContent: 'center', alignItems: 'center', padding: '6%', boxSizing: 'border-box' }}
    >
      <div style={{ width: stageW, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
        {heading ? (
          <div
            style={{
              fontFamily: BODY_FONT,
              fontSize: 24 * u,
              fontWeight: 600,
              color: theme.muted,
              marginBottom: 10 * u,
              opacity: headIn,
            }}
          >
            {heading}
          </div>
        ) : null}

        <div
          style={{
            fontFamily: MONO_FONT,
            fontSize: 24 * u,
            letterSpacing: 4 * u,
            textTransform: 'uppercase',
            color: theme.accent,
            marginBottom: 22 * u,
            opacity: headIn,
          }}
        >
          {kicker}
        </div>

        {/* The finding, cited against an accent rule. KineticText animates the
            words in on the scene clock, so the quote arrives as it is spoken. */}
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div
            style={{
              width: railW,
              background: theme.accent,
              marginRight: railPad,
              flex: '0 0 auto',
              transformOrigin: 'top',
              transform: `scaleY(${headIn})`,
            }}
          />
          <h1
            style={{
              margin: 0,
              fontFamily: displayFont,
              fontWeight: 800,
              fontSize: findFs,
              lineHeight: 1.14,
              color: theme.text,
              maxWidth: findW,
            }}
          >
            <KineticText text={finding} highlight={meta.style?.highlight} />
          </h1>
        </div>

        {/* Attribution: a hairline rule, then "— source" with the metadata as
            reference tags. Slides up and fades in after the quote. */}
        <div
          style={{
            marginTop: 34 * u,
            marginLeft: railW + railPad,
            opacity: attrIn,
            transform: `translateY(${(1 - attrIn) * 14 * u}px)`,
          }}
        >
          <div
            style={{
              height: Math.max(1, 1.6 * u),
              width: 60 * u,
              background: hairline(theme, 0.4),
              marginBottom: 16 * u,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 * u, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-block',
                fontFamily: displayFont,
                fontSize: 30 * u,
                fontWeight: 800,
                color: theme.text,
                // The cited source is the hero — a ±0.3% idle breath keeps the
                // citation from ever being a fully frozen frame (Law 6).
                transform: `scale(${idleScale(frame, fps)})`,
                transformOrigin: 'left center',
              }}
            >
              {source}
            </span>
            {year ? chip(year, 'year') : null}
            {sample ? chip(sample, 'sample') : null}
          </div>
        </div>

        {caption ? (
          <div
            style={{
              marginTop: 22 * u,
              marginLeft: railW + railPad,
              fontFamily: MONO_FONT,
              fontSize: 21 * u,
              letterSpacing: 1.2 * u,
              color: theme.muted,
              opacity: attrIn,
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
