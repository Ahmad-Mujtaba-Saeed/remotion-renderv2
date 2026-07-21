import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, LayerItem } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, isLightTheme, hairline, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText, fitGroup } from '../typography';
import { clamp01, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';
import { KineticText } from '../components/KineticText';
import { calloutRevealSchedule } from '../components/CalloutLayer';

/**
 * layer_stack — the "what's inside X" beat drawn as what it is: 3-6 flat
 * slabs stacked top-to-bottom in their REAL order (the array is TOP FIRST and
 * the validator never rearranges it — the order IS the content). Each slab
 * settles into place with its label as the narration reaches it, deeper
 * layers shade progressively toward ink so the stack reads as depth without
 * a single gradient, and the highlighted layer (the one this beat is about)
 * takes the accent. Everything is measured from the slab count, so the card
 * is deterministic at any aspect. Flat law: solid fields, hairline edges, no
 * texture. Silent per §1.3.
 */
export const LayerStack: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_layers'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;
  const layers: LayerItem[] = (slot.layers ?? [])
    .filter((l) => l && (l.label ?? '').trim() !== '')
    .slice(0, 6);
  if (layers.length < 3) return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  const highlight =
    typeof slot.highlight_index === 'number' && layers[slot.highlight_index] !== undefined
      ? slot.highlight_index
      : null;

  // ---- Geometry ------------------------------------------------------------
  // The stage budgets the heading zone FIRST (the label-zone class of bug:
  // cycle iter 7, venn iter 17, decision iter 20), then divides what is left
  // among the slabs. Slab heights breathe with the count: three layers read
  // as geology, six as a network stack.
  const stackW = width * (portrait ? 0.82 : 0.54);
  const headFs = heading
    ? fitText(heading, {
        width: width * (portrait ? 0.86 : 0.7),
        max: 56 * u,
        min: 30 * u,
        maxLines: 2,
        font: displayFont,
        weight: 900,
      })
    : 0;
  const headZone = (kicker ? 40 * u : 0) + (heading ? headFs * 1.15 * 2 * 0.62 : 0) + 26 * u;
  const capZone = caption ? 52 * u : 16 * u;
  const availH = height * 0.86 - headZone - capZone;
  const gap = 6 * u;
  const slabH = Math.min(120 * u, (availH - gap * (layers.length - 1)) / layers.length);

  // One shared label size solved from the longest label (iter 24: a column
  // whose rows each pick their own size reads as a ransom note). kinetic off:
  // slab labels render as continuous text.
  const hasCaptions = layers.some((l) => (l.caption ?? '').trim() !== '');
  const labelFs = fitGroup(
    layers.map((l) => l.label.trim()),
    {
      width: stackW * 0.86,
      max: Math.min(34 * u, slabH * (hasCaptions ? 0.34 : 0.44)),
      min: 18 * u,
      maxLines: 1,
      font: BODY_FONT,
      weight: 700,
      kinetic: false,
    }
  );
  const capFs = Math.max(15 * u, labelFs * 0.62);

  // Reveals ride the narration's own words; fallback spreads evenly.
  const at = calloutRevealSchedule(
    layers.map((l) => l.label.trim()),
    scene.narration_words,
    fps,
    { first: f30(fps, 14), step: f30(fps, 12) }
  );

  // Depth shading: each slab is the panel colour pulled a step further toward
  // ink (toward paper on dark themes would glow — depth always darkens).
  const depthTint = (i: number): string =>
    isLightTheme(theme)
      ? `rgba(23,18,14,${0.035 * i})`
      : `rgba(0,0,0,${0.09 * i})`;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '5%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {(kicker || heading) && (
          <div style={{ textAlign: 'center', marginBottom: 26 * u }}>
            {kicker ? (
              <div
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 24 * u,
                  letterSpacing: 4 * u,
                  textTransform: 'uppercase',
                  color: theme.accent,
                  marginBottom: 12 * u,
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

        <div style={{ display: 'flex', flexDirection: 'column', gap, width: stackW }}>
          {layers.map((layer, i) => {
            const settle = spring({
              frame: Math.max(0, frame - at[i]),
              fps,
              config: SPRINGS.pop,
              durationInFrames: Math.round(fps * 0.5),
            });
            const visible = clamp01(settle);
            const isStar = i === highlight;
            const cap = (layer.caption ?? '').trim();
            return (
              <div
                key={i}
                style={{
                  height: slabH,
                  background: isStar ? theme.accent : theme.panel,
                  border: `1px solid ${hairline(theme, isStar ? 0.34 : 0.16)}`,
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  textAlign: 'center',
                  padding: `0 ${stackW * 0.06}px`,
                  position: 'relative',
                  opacity: visible,
                  // Slabs drop INTO the stack from just above their seat — the
                  // motion of laying a layer down, kept small enough to never
                  // cross the slab above.
                  transform: `translateY(${(1 - Math.min(1, settle)) * -slabH * 0.35}px)`,
                }}
              >
                {/* Depth: deeper slabs sit a step darker. Painted as an inset
                    layer so the accent highlight keeps its true colour. */}
                {!isStar && i > 0 ? (
                  <div style={{ position: 'absolute', inset: 0, background: depthTint(i), pointerEvents: 'none' }} />
                ) : null}
                <div
                  style={{
                    position: 'relative',
                    fontFamily: BODY_FONT,
                    fontSize: labelFs,
                    fontWeight: 700,
                    color: isStar ? inkOn(theme.accent) : theme.text,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {layer.label.trim()}
                </div>
                {cap !== '' && slabH > 62 * u ? (
                  <div
                    style={{
                      position: 'relative',
                      marginTop: 4 * u,
                      fontFamily: BODY_FONT,
                      fontSize: capFs,
                      fontWeight: 500,
                      color: isStar ? inkOn(theme.accent) : theme.muted,
                      opacity: isStar ? 0.85 : 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}
                  >
                    {cap}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {caption ? (
          <div
            style={{
              marginTop: 22 * u,
              fontFamily: MONO_FONT,
              fontSize: 23 * u,
              letterSpacing: 1.4 * u,
              color: theme.muted,
              opacity: headIn,
              textAlign: 'center',
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
