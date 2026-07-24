import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, TimelineNode } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText, fitGroup, lineCount } from '../typography';
import { clamp01, easeInOutSine } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { useCardReveal } from '../motion/cardReveal';
import { KineticText } from '../components/KineticText';

/** Golden-section anchor for the active node (fraction of the frame axis). */
const GOLDEN = 0.382;

/**
 * timeline_card (copilot.md §5.7): a hairline rail draws across the frame
 * (horizontal in 16:9, vertical in 9:16) and 3-6 dated nodes pop on in
 * sequence — the whole strip GLIDES so the active node keeps the
 * golden-section point, a camera made of one transform. Dates set as mono
 * kickers, labels underneath; the newest node takes the accent.
 */
export const TimelineCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_timeline'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const reveal = useCardReveal();
  const { fps, width, height } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;
  const nodes: TimelineNode[] = (slot.nodes ?? []).slice(0, 6);
  if (nodes.length < 2) return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const headIn = reveal.ease(clamp01(frame / reveal.headFrames));

  /*
   * The heading is solved against the column, and — because the solver can
   * also tell us how many lines it took — the strip below can RESERVE that
   * band. The sweep caught node 1 landing on top of a three-line portrait
   * heading; nothing here had ever asked how tall the heading was.
   */
  const headOpts = {
    width: width * (portrait ? 0.82 : 0.76),
    max: 60 * u,
    min: 30 * u,
    maxLines: 2,
    font: displayFont,
    weight: 900 as const,
  };
  const headFs = heading ? fitText(heading, headOpts) : 0;
  const headLines = heading ? lineCount(heading, headFs, headOpts) : 0;
  const headBand = height * 0.07
    + (portrait ? height * 0.04 : 0)
    + (kicker ? 38 * u : 0)
    + headLines * headFs * 1.05
    + 46 * u;

  /*
   * The label column, in pixels. It has to be EXPLICIT in portrait: the strip
   * is an absolutely-positioned shrink-to-fit flex container, so without a
   * width its text children collapse to min-content — every label wrapped at
   * its longest word ("Compound / interest / quietly / beat" for a four-word
   * label). The sweep made that visible on all six nodes at once.
   */
  const labelW = portrait ? width * 0.56 : 360 * u;
  const labelFs = fitGroup(nodes.map((n) => (n.label ?? '').trim()), {
    width: labelW,
    max: 30 * u,
    min: 20 * u,
    maxLines: 2,
    font: BODY_FONT,
    weight: 600,
  });

  // Node i pops at its slot in the scene's active stretch.
  const startAt = f30(fps, 16);
  const endAt = Math.round(durationInFrames * 0.8);
  const step = Math.max(f30(fps, 12), Math.floor((endAt - startAt) / nodes.length));
  const nodeAt = (i: number): number => startAt + i * step;

  // The rail leads: it draws just ahead of the newest node.
  const railP = easeInOutSine(
    clamp01((frame - f30(fps, 6)) / (nodeAt(nodes.length - 1) + f30(fps, 4) - f30(fps, 6)))
  );

  // Which node is "active" (the last one that has landed) and the eased
  // glide of the strip toward keeping it at the golden point.
  /*
   * Portrait spacing adapts to the room actually left under the heading, so a
   * six-node timeline sits still instead of gliding half of itself off-screen.
   * Landscape keeps its fixed segment: the strip runs across the width, which
   * no heading competes for.
   */
  const availAxis = portrait ? Math.max(240 * u, height * 0.93 - headBand) : width;
  const seg = portrait
    ? Math.max(150 * u, Math.min(300 * u, (availAxis * 0.86) / Math.max(1, nodes.length - 1)))
    : 420 * u;
  let activeF = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (frame >= nodeAt(i)) {
      const into = clamp01((frame - nodeAt(i)) / f30(fps, 14));
      activeF = i === 0 ? 0 : i - 1 + easeInOutSine(into);
    }
  }
  const axis = portrait ? height : width;
  const stripLen = (nodes.length - 1) * seg;
  // Never glide past what keeps the strip on screen.
  // Where node 0 sits at rest: under the reserved heading band in portrait,
  // at the golden point across the frame in landscape.
  const anchor = portrait ? headBand : axis * GOLDEN;
  const rawShift = anchor - activeF * seg;
  const shift = portrait
    ? Math.max(Math.min(rawShift, anchor), Math.min(anchor, height * 0.93 - stripLen))
    : Math.max(Math.min(rawShift, axis * GOLDEN), axis * (1 - GOLDEN) - stripLen);

  const nodeEl = (node: TimelineNode, i: number): React.ReactNode => {
    const pop = spring({
      frame: Math.max(0, frame - nodeAt(i)),
      fps,
      config: reveal.config,
      durationInFrames: reveal.popFrames,
    });
    const isActive = Math.round(activeF) === i && frame >= nodeAt(i);
    const dot = isActive ? theme.accent : theme.text;
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          ...(portrait
            ? { top: i * seg, left: 0, flexDirection: 'row' as const }
            : { left: i * seg, top: 0, flexDirection: 'column' as const }),
          display: 'flex',
          alignItems: 'center',
          gap: 18 * u,
          transform: `scale(${Math.min(1.06, pop)})`,
          opacity: Math.min(1, pop),
          width: portrait ? labelW + 64 * u : seg,
          marginLeft: portrait ? 0 : -seg / 2,
          textAlign: portrait ? 'left' : 'center',
        }}
      >
        <div
          style={{
            width: 22 * u,
            height: 22 * u,
            borderRadius: '50%',
            background: dot,
            border: `${3 * u}px solid ${theme.bg_from}`,
            flexShrink: 0,
            ...(portrait ? { marginLeft: -11 * u } : { margin: `${-11 * u}px auto 0` }),
          }}
        />
        <div style={{ ...(portrait ? { paddingLeft: 26 * u } : { paddingTop: 14 * u }) }}>
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 26 * u,
              fontWeight: 700,
              letterSpacing: 3 * u,
              textTransform: 'uppercase',
              color: isActive ? theme.accent : theme.muted,
            }}
          >
            {node.date}
          </div>
          <div
            style={{
              fontFamily: BODY_FONT,
              fontSize: labelFs,
              fontWeight: 600,
              lineHeight: 1.25,
              color: theme.text,
              maxWidth: labelW,
              marginTop: 8 * u,
            }}
          >
            {node.label}
          </div>
        </div>
      </div>
    );
  };

  return (
    <AbsoluteFill style={{ padding: '7%', boxSizing: 'border-box', justifyContent: 'flex-start' }}>
      {(kicker || heading) && (
        <div style={{ textAlign: 'center', marginTop: portrait ? '4%' : '2%' }}>
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
                fontSize: headFs,
                lineHeight: 1.05,
                color: theme.text,
              }}
            >
              <KineticText text={heading} highlight={meta.style?.highlight} />
            </h1>
          ) : null}
        </div>
      )}

      {/* The strip: rail + nodes, glided by one transform. */}
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            ...(portrait
              ? { left: '26%', top: 0, transform: `translateY(${shift}px)` }
              : { top: '58%', left: 0, transform: `translateX(${shift}px)` }),
          }}
        >
          {/* Rail (draws ahead of the newest node). */}
          <div
            style={{
              position: 'absolute',
              background: hairline(theme, 0.3),
              ...(portrait
                ? { left: -1, top: 0, width: 2, height: stripLen * railP }
                : { top: -1, left: 0, height: 2, width: stripLen * railP }),
            }}
          />
          {nodes.map((n, i) => nodeEl(n, i))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
