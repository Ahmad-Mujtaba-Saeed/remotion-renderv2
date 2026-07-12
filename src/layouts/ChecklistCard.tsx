import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { IconStroke } from '../icons/IconStroke';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SfxCue } from '../sfx';
import { KineticText } from '../components/KineticText';

/**
 * checklist_card (copilot.md §5.4): pros vs cons in two columns split by a
 * centre hairline — rows stamp in alternating left/right every 8 frames, the
 * ✓ drawing itself in accent and the ✗ in muted (on-palette, never red/green
 * floods). Without cons it collapses to a single centered checklist. ONE
 * stamp on the first row only — a landmark, not a per-row chirp (§1.3).
 */
export const ChecklistCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_checklist'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps } = useVideoConfig();
  const { frame } = useSceneClock();
  const win = useSceneWindow();
  const meta = useSceneMeta();

  if (!slot) return null;

  const pros = (slot.pros ?? []).slice(0, 4);
  const cons = (slot.cons ?? []).slice(0, 4);
  const twoCol = cons.length > 0;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();

  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));
  const ruleP = easeOutQuint(clamp01((frame - f30(fps, 6)) / f30(fps, 10)));
  const firstRowAt = f30(fps, 16);
  const rowStep = f30(fps, 8);

  // Rows interleave L,R,L,R… (visual order) — row k of column c appears at
  // its global interleaved slot so the stamps genuinely alternate.
  const rowAt = (col: 'pro' | 'con', i: number): number =>
    firstRowAt + (twoCol ? i * 2 + (col === 'con' ? 1 : 0) : i) * rowStep;

  const row = (text: string, col: 'pro' | 'con', i: number): React.ReactNode => {
    const t = rowAt(col, i);
    const p = easeOutQuint(clamp01((frame - t) / f30(fps, 8)));
    const drawP = clamp01((frame - t - f30(fps, 2)) / f30(fps, 8));
    const isPro = col === 'pro';
    return (
      <div
        key={`${col}-${i}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 22 * u,
          padding: `${18 * u}px 0`,
          opacity: p,
          transform: `translateX(${(1 - p) * 18 * (isPro ? -1 : 1) * u}px)`,
        }}
      >
        <div style={{ flexShrink: 0, width: 44 * u, height: 44 * u }}>
          <IconStroke
            name={isPro ? 'check' : 'x'}
            progress={drawP}
            size={44 * u}
            color={isPro ? theme.accent : theme.muted}
            strokeWidth={2.6}
          />
        </div>
        <span
          style={{
            fontFamily: BODY_FONT,
            fontSize: 34 * u,
            fontWeight: 600,
            lineHeight: 1.3,
            color: isPro ? theme.text : theme.muted,
          }}
        >
          {text}
        </span>
      </div>
    );
  };

  const columnHeader = (label: string): React.ReactNode => (
    <div
      style={{
        fontFamily: MONO_FONT,
        fontSize: 24 * u,
        fontWeight: 700,
        letterSpacing: 4 * u,
        textTransform: 'uppercase',
        color: theme.accent,
        marginBottom: 18 * u,
        opacity: headIn,
      }}
    >
      {label}
    </div>
  );

  const at = win?.start ?? 0;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '7%', boxSizing: 'border-box' }}>
      {/* One landmark stamp as the first row lands — never per-row (§1.3). */}
      <SfxCue name="stamp" at={at + firstRowAt} volume={0.58} />

      <div style={{ width: '100%', maxWidth: 1400 * u }}>
        {kicker || heading ? (
          <div style={{ textAlign: 'center', marginBottom: 44 * u }}>
            {kicker ? (
              <div
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 24 * u,
                  letterSpacing: 4 * u,
                  textTransform: 'uppercase',
                  color: theme.accent,
                  marginBottom: 16 * u,
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
                  fontSize: 64 * u,
                  lineHeight: 1.05,
                  color: theme.text,
                }}
              >
                <KineticText text={heading} highlight={meta.style?.highlight} />
              </h1>
            ) : null}
          </div>
        ) : null}

        {twoCol ? (
          <div style={{ display: 'flex', gap: 56 * u, alignItems: 'stretch' }}>
            <div style={{ flex: 1 }}>
              {columnHeader(slot.pros_label ?? 'Pros')}
              {pros.map((t, i) => row(t, 'pro', i))}
            </div>
            {/* The centre hairline draws down as the columns fill. */}
            <div style={{ width: 2, alignSelf: 'stretch' }}>
              <div style={{ width: '100%', height: `${ruleP * 100}%`, background: hairline(theme, 0.24) }} />
            </div>
            <div style={{ flex: 1 }}>
              {columnHeader(slot.cons_label ?? 'Cons')}
              {cons.map((t, i) => row(t, 'con', i))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 980 * u, margin: '0 auto' }}>
            {pros.map((t, i) => row(t, 'pro', i))}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
