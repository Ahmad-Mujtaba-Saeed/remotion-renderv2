import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { IconStroke } from '../icons/IconStroke';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT, BODY_FONT } from '../theme';
import { useSurfaceStyle } from '../components/Surface';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01, easeOutCubic, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SfxCue } from '../sfx';
import { KineticText } from '../components/KineticText';

/**
 * myth_fact — the debunk beat. The belief is presented first, neutral, as
 * people say it; at the narration's pivot ("actually…", "the truth is…") an
 * ✗ draws, a strike-through crosses the myth and the panel dims, and the
 * FACT panel stamps in beneath with its ✓. The pivot follows the narration
 * word that turns the argument when timings exist, so the strike lands as
 * the narrator says "actually" — a fixed 42% fallback otherwise.
 *
 * On-palette like checklist_card: ✗/strike in muted, ✓/bar in accent —
 * never red/green floods. ONE stamp SFX, on the fact landing (§1.3).
 */
export const MythFact: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_myth_fact'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const surface = useSurfaceStyle(false);
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const win = useSceneWindow();
  const meta = useSceneMeta();

  if (!slot) return null;
  const myth = (slot.myth ?? '').trim();
  const fact = (slot.fact ?? '').trim();
  if (myth === '' || fact === '') return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  const mythAt = f30(fps, 16);
  const total = Math.max(1, Math.round((scene.duration_seconds || 6) * fps));

  // The pivot: the first turning word after a fifth of the narration.
  const pivot = (() => {
    const words = scene.narration_words ?? [];
    const turn = /^(actually|but|truth|fact|really|reality|wrong|except|nope?)$/;
    for (let i = Math.floor(words.length * 0.2); i < words.length; i++) {
      const w = (words[i].word ?? '').toLowerCase().replace(/[^a-z]/g, '');
      if (turn.test(w)) {
        return Math.max(Math.round(words[i].start * fps), mythAt + f30(fps, 26));
      }
    }
    return Math.max(Math.round(total * 0.42), mythAt + f30(fps, 26));
  })();
  const factAt = pivot + f30(fps, 10);

  const mythIn = easeOutQuint(clamp01((frame - mythAt) / f30(fps, 12)));
  const crossP = clamp01((frame - pivot) / f30(fps, 8));
  const strikeP = easeOutCubic(clamp01((frame - pivot - f30(fps, 3)) / f30(fps, 9)));
  const dimP = easeOutCubic(clamp01((frame - pivot) / f30(fps, 14)));
  const factIn = easeOutQuint(clamp01((frame - factAt) / f30(fps, 11)));

  const eyebrow = (label: string, color: string, on: number): React.ReactNode => (
    <div
      style={{
        fontFamily: MONO_FONT,
        fontSize: 23 * u,
        fontWeight: 700,
        letterSpacing: 4 * u,
        textTransform: 'uppercase',
        color,
        marginBottom: 12 * u,
        opacity: on,
      }}
    >
      {label}
    </div>
  );

  const bodySize = (portrait ? 38 : 42) * u;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '7%', boxSizing: 'border-box' }}>
      {/* One landmark: the correction stamping in. */}
      <SfxCue name="stamp" at={(win?.start ?? 0) + factAt} volume={0.6} />

      <div style={{ width: '100%', maxWidth: (portrait ? 900 : 1240) * u }}>
        {(kicker || heading) && (
          <div style={{ textAlign: 'center', marginBottom: 48 * u }}>
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
                }}
              >
                {kicker}
              </div>
            ) : null}
            {heading ? (
              <h1
                style={{
                  margin: 0,
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
          </div>
        )}

        {/* THE MYTH — presented straight, then struck. */}
        <div
          style={{
            ...surface,
            padding: `${30 * u}px ${38 * u}px`,
            opacity: mythIn * (1 - dimP * 0.45),
            transform: `translateY(${(1 - mythIn) * 30 * u}px)`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 26 * u }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {eyebrow('Myth', theme.muted, mythIn)}
              <div
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  fontFamily: BODY_FONT,
                  fontSize: bodySize,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  color: theme.text,
                }}
              >
                “{myth}”
                {/* The strike draws through the words at the pivot. */}
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
            <div style={{ flexShrink: 0, width: 52 * u, height: 52 * u, marginTop: 6 * u }}>
              <IconStroke name="x" progress={crossP} size={52 * u} color={theme.muted} strokeWidth={2.6} />
            </div>
          </div>
        </div>

        {/* THE FACT — stamps in below with the accent. */}
        <div
          style={{
            ...surface,
            position: 'relative',
            marginTop: 30 * u,
            padding: `${30 * u}px ${38 * u}px ${30 * u}px ${44 * u}px`,
            opacity: factIn,
            transform: `scale(${1.05 - 0.05 * factIn})`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 8 * u,
              background: theme.accent,
              transformOrigin: 'top',
              transform: `scaleY(${factIn})`,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 26 * u }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {eyebrow('Fact', theme.accent, factIn)}
              <div
                style={{
                  fontFamily: BODY_FONT,
                  fontSize: bodySize,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  color: theme.text,
                }}
              >
                {fact}
              </div>
            </div>
            <div style={{ flexShrink: 0, width: 52 * u, height: 52 * u, marginTop: 6 * u }}>
              <IconStroke
                name="check"
                progress={clamp01((frame - factAt - f30(fps, 3)) / f30(fps, 9))}
                size={52 * u}
                color={theme.accent}
                strokeWidth={2.6}
              />
            </div>
          </div>
          {/* Hairline base completing the panel. */}
          <div
            style={{
              marginTop: 20 * u,
              height: 1,
              background: hairline(theme, 0.16),
              transformOrigin: 'left',
              transform: `scaleX(${factIn})`,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
