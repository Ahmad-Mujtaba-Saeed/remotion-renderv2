import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, Slot, VersusSide } from '../types';
import { MediaSlot } from '../components/MediaSlot';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useTheme, useDisplayFont, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitGroup } from '../typography';
import { clamp01, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { useCardReveal } from '../motion/cardReveal';
import { parseCountable, rollText } from '../motion/CountUp';
import { SfxCue } from '../sfx';

/**
 * versus_card (copilot.md §5.1) — the head-to-head showdown:
 *
 *   f0   centre seam (ink hairline) draws top→bottom (10f)
 *   f4   left media panel slides in from the left (clip reveal, 14f)
 *   f8   right panel from the right (Law 3: offset, never simultaneous)
 *   f16  VS badge: solid accent circle, ink "VS", reveal.config pop + whoosh_impact
 *   f22+ stat rows alternate L,R every 10f (numeric tokens count up)
 *   end  verdict row floods accent (solid wipe) + stamp — only when present
 *
 * Flat throughout: the seam is a rule, the badge a solid circle, the flood a
 * solid colour wipe. Transform/clip/colour only.
 */
export const VersusCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const left = scene.slots['slot_left'];
  const right = scene.slots['slot_right'];
  const versus: Slot | undefined = scene.slots['slot_versus'];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const reveal = useCardReveal();
  const { fps, width, height } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();
  const win = useSceneWindow();
  const at = win?.start ?? 0;

  const sideL: VersusSide = versus?.left ?? {};
  const sideR: VersusSide = versus?.right ?? {};
  const verdict = (versus?.verdict ?? '').trim();
  /*
   * Both sides share ONE size per role, solved from the longest string on
   * either side: a comparison whose left column is set larger than its right
   * is not a comparison. The label chip sits inside a half-frame panel and had
   * no fit at all — at 20 characters it ran off the edge of the frame.
   */
  const sideLabelFs = fitGroup(
    [(versus?.left?.label ?? '').trim(), (versus?.right?.label ?? '').trim()],
    { width: width * 0.36, max: 26 * u, min: 15 * u, maxLines: 1, font: MONO_FONT, weight: 700, letterSpacing: 3 * u, kinetic: false }
  );
  const statFs = fitGroup(
    [...((versus?.left?.stats ?? []) as string[]), ...((versus?.right?.stats ?? []) as string[])],
    { width: width * 0.4, max: 32 * u, min: 20 * u, maxLines: 1, font: BODY_FONT, weight: 600, kinetic: false }
  );

  const seamP = easeOutQuint(clamp01(frame / f30(fps, 10)));
  const badgeAt = f30(fps, 16);
  const badgeIn = spring({
    frame: Math.max(0, frame - badgeAt),
    fps,
    config: reveal.config,
    durationInFrames: reveal.popFrames,
  });

  const panel = (slot: Slot | undefined, side: VersusSide, isLeft: boolean): React.ReactNode => {
    const inAt = f30(fps, isLeft ? 4 : 8);
    const p = easeOutQuint(clamp01((frame - inAt) / f30(fps, 14)));
    const off = (1 - p) * 6 * (isLeft ? -1 : 1);
    const label = (side.label ?? slot?.label ?? '').trim();
    return (
      <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          transform: `translateX(${off}%)`,
          clipPath: isLeft ? `inset(0 ${(1 - p) * 100}% 0 0)` : `inset(0 0 0 ${(1 - p) * 100}%)`,
        }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          {slot ? <MediaSlot slot={slot} /> : <div style={{ position: 'absolute', inset: 0, background: theme.panel }} />}
        </div>
        {/* Flat ink scrim strip keeps the side label legible over any media. */}
        {label ? (
          <div
            style={{
              position: 'absolute',
              top: 26 * u,
              [isLeft ? 'left' : 'right']: 26 * u,
              padding: `${10 * u}px ${22 * u}px`,
              background: theme.bg_from,
              border: `1px solid ${theme.accent}`,
              fontFamily: MONO_FONT,
              fontSize: sideLabelFs,
              fontWeight: 700,
              letterSpacing: 3 * u,
              whiteSpace: 'nowrap',
              textTransform: 'uppercase',
              color: theme.text,
              opacity: p,
            }}
          >
            {label}
          </div>
        ) : null}
      </div>
    );
  };

  const statRow = (text: string, i: number, isLeft: boolean): React.ReactNode => {
    const rowAt = f30(fps, 22) + i * f30(fps, 10);
    const p = easeOutQuint(clamp01((frame - rowAt) / f30(fps, 10)));
    const words = text.split(' ');
    return (
      <div
        key={`${isLeft ? 'l' : 'r'}-${i}`}
        style={{
          fontFamily: BODY_FONT,
          fontSize: statFs,
          fontWeight: 600,
          color: theme.text,
          textAlign: isLeft ? 'right' : 'left',
          padding: `${12 * u}px 0`,
          opacity: p,
          transform: `translateX(${(1 - p) * 22 * (isLeft ? 1 : -1) * u}px)`,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {words.map((w, wi) => {
          const token = parseCountable(w);
          return (
            <span key={wi}>
              {token ? rollText(token, Math.max(0, frame - rowAt), fps) : w}
              {wi < words.length - 1 ? ' ' : ''}
            </span>
          );
        })}
      </div>
    );
  };

  // The verdict flood claims the frame's last stretch (skipped when absent).
  const verdictAt = Math.max(f30(fps, 60), Math.round(durationInFrames * 0.78));
  const floodP = verdict ? easeOutQuint(clamp01((frame - verdictAt) / f30(fps, 8))) : 0;
  const verdictInk = inkOn(theme.accent);

  const statsL = (sideL.stats ?? []).slice(0, 3);
  const statsR = (sideR.stats ?? []).slice(0, 3);

  return (
    <AbsoluteFill>
      <SfxCue name="whoosh_impact" at={at + badgeAt} volume={1.1} />
      {verdict ? <SfxCue name="stamp" at={at + verdictAt} volume={0.75} /> : null}

      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Media face-off. */}
        <div style={{ flex: 1.6, display: 'flex', position: 'relative', minHeight: 0 }}>
          {panel(left, sideL, true)}
          {panel(right, sideR, false)}

          {/* Centre seam draws top→bottom before anything else moves. */}
          <div
            style={{
              position: 'absolute',
              left: `calc(50% - ${1.5 * u}px)`,
              top: 0,
              width: 3 * u,
              height: `${seamP * 100}%`,
              background: theme.text,
            }}
          />

          {/* VS badge slams in over the seam. */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 150 * u,
              height: 150 * u,
              borderRadius: '50%',
              background: theme.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `translate(-50%, -50%) scale(${badgeIn})`,
              fontFamily: displayFont,
              fontWeight: 900,
              fontSize: 60 * u,
              color: inkOn(theme.accent),
            }}
          >
            VS
          </div>
        </div>

        {/* Alternating stat rows, hung off the seam. */}
        {statsL.length || statsR.length ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              gap: 60 * u,
              padding: `${30 * u}px 6%`,
              boxSizing: 'border-box',
            }}
          >
            <div style={{ flex: 1 }}>{statsL.map((s, i) => statRow(s, i, true))}</div>
            <div style={{ width: 2, background: `${theme.muted}44` }} />
            <div style={{ flex: 1 }}>{statsR.map((s, i) => statRow(s, i, false))}</div>
          </div>
        ) : null}
      </AbsoluteFill>

      {/* Verdict: a solid accent flood wipes up from the bottom edge. */}
      {verdict ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 150 * u,
            background: theme.accent,
            clipPath: `inset(${(1 - floodP) * 100}% 0 0 0)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: displayFont,
            fontWeight: 900,
            fontSize: fitGroup([verdict], {
              width: width * 0.86,
              max: 44 * u,
              min: 24 * u,
              maxLines: 1,
              font: displayFont,
              weight: 900,
            }),
            color: verdictInk,
            textAlign: 'center',
            padding: '0 6%',
            boxSizing: 'border-box',
          }}
        >
          {verdict}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
