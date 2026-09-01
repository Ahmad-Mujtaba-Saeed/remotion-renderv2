import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, Slot } from '../types';
import { MediaSlot } from '../components/MediaSlot';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText, fitGroup } from '../typography';
import { clamp01 } from '../motion/easing';
import { useCardReveal } from '../motion/cardReveal';
import { calloutRevealSchedule } from '../components/CalloutLayer';

/**
 * image_grid — several pictures on screen AT ONCE.
 *
 * The distinction from photo_stack is the whole card: a stack shows one print
 * at a time and flips, so the viewer only ever holds one image in their head.
 * This one is for the beat whose argument IS the set — four examples of the
 * same failure, the six variants it produced, the three species side by side.
 * The cells land one at a time as the narration names them, and every landed
 * cell STAYS, so by the last word the whole comparison is in frame together.
 *
 * Two decisions carry the layout:
 *
 * **The frames are drawn from frame 0, empty.** Revealing cells into nothing
 * would re-flow the composition on every landing — the grid would jump four
 * times in six seconds. Instead the full lattice of hairline frames is there
 * from the start and each picture fills its own; the geometry never moves.
 *
 * **Column count is chosen for legibility, not tidiness.** A tall frame runs
 * ONE column at three cells — three wide bands, the most readable shape in
 * 9:16 — and two above that; a wide frame runs the cells in a row up to
 * three, then 2x2 and 3x2. Six is the ceiling in both, probed at full size.
 *
 * Reveal timing rides the captions through `calloutRevealSchedule`, so a cell
 * lands on the word that names it when word timings exist, and on the motion
 * style's own cadence when they don't. Flat law: hairline frames, solid
 * captions, no shadows. Silent per §1.3.
 */
export const ImageGrid: React.FC<{ scene: Scene }> = ({ scene }) => {
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();
  const reveal = useCardReveal();

  const cells: Slot[] = [];
  for (let i = 1; i <= 6; i++) {
    const slot = scene.slots[`slot_image_${i}`];
    if (slot) cells.push(slot);
  }
  if (cells.length < 2) return null;

  const portrait = height > width;
  const n = cells.length;
  const heading = (cells[0].heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? '').trim();
  const captions = cells.map((c) => (c.label ?? '').trim());
  const hasCaptions = captions.some((c) => c !== '');

  // ---- Reading-order geometry ----------------------------------------------
  const cols = portrait ? (n <= 3 ? 1 : 2) : n <= 3 ? n : n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);

  const headFs = heading
    ? fitText(heading, {
        width: width * (portrait ? 0.86 : 0.74),
        max: 52 * u,
        min: 26 * u,
        maxLines: 2,
        font: displayFont,
        weight: 900,
      })
    : 0;

  const gap = 22 * u;
  const stageW = width * (portrait ? 0.9 : 0.88);
  const cellW = (stageW - gap * (cols - 1)) / cols;

  // The caption type is solved against the NARROWEST thing it must fit inside
  // — the cell itself — and every cell is the same width here, so one solve
  // serves them all.
  const capFs = hasCaptions
    ? fitGroup(captions, {
        width: cellW * 0.92,
        max: 26 * u,
        min: 14 * u,
        maxLines: 2,
        font: BODY_FONT,
        weight: 700,
        kinetic: false,
      })
    : 0;

  const headZone = (kicker ? 38 * u : 0) + (heading ? headFs * 1.2 : 0) + (kicker || heading ? 26 * u : 0);
  const capZone = hasCaptions ? capFs * 1.9 + 10 * u : 0;
  const stageH = height * 0.86 - headZone;
  // Cells are PHOTO-shaped, not "whatever is left over". Dividing the stage
  // height by the row count gave three 505x780 portraits for a three-cell
  // landscape grid — and almost every real photograph, stock or generated, is
  // landscape, so each one would have been letterboxed or cropped to a sliver
  // of itself. The height is the smaller of a 4:3-ish cell and what the rows
  // can afford; the grid simply sits centred in whatever it does not use.
  const roomH = (stageH - gap * (rows - 1)) / rows - capZone;
  // A three-cell grid has a whole frame to itself and can afford near-square
  // cells; a six-cell grid cannot, and 4:3 keeps six of them off each other.
  const roomy = cellW * (n <= 3 ? 0.9 : 0.75);
  const cellH = Math.max(80 * u, Math.min(roomy, roomH));

  const headIn = reveal.ease(clamp01(frame / reveal.headFrames));
  // A cell lands on the word that names it; an uncaptioned grid falls back to
  // the motion style's own first/step cadence.
  const at = calloutRevealSchedule(
    captions.map((c, i) => c || `cell ${i + 1}`),
    hasCaptions ? scene.narration_words : undefined,
    fps,
    { first: reveal.first, step: reveal.step }
  );

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: '5%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {(kicker || heading) && (
          <div style={{ textAlign: 'center', marginBottom: 26 * u, opacity: headIn }}>
            {kicker ? (
              <div
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 24 * u,
                  letterSpacing: 4 * u,
                  textTransform: 'uppercase',
                  color: theme.accent,
                  marginBottom: heading ? 10 * u : 0,
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
                  fontSize: headFs,
                  lineHeight: 1.1,
                  color: theme.text,
                  transform: `translateY(${(1 - headIn) * reveal.rise * u}px)`,
                }}
              >
                {heading}
              </div>
            ) : null}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${cellW}px)`,
            gap,
            justifyContent: 'center',
          }}
        >
          {cells.map((slot, i) => {
            // The style's own spring, so the crisp / bounce / elegant picker
            // re-times the landings instead of every video popping alike.
            const land = spring({
              frame: Math.max(0, frame - at[i]),
              fps,
              config: reveal.config,
              durationInFrames: reveal.popFrames,
            });
            const shown = frame >= at[i];
            const capIn = reveal.ease(clamp01((frame - at[i] - reveal.step * 0.4) / reveal.headFrames));

            return (
              <div key={i} style={{ width: cellW, display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    position: 'relative',
                    width: cellW,
                    height: cellH,
                    // The empty frame holds the space from the first frame, so
                    // nothing in the grid moves when a picture arrives.
                    border: `1px solid ${hairline(theme, shown ? 0.3 : 0.14)}`,
                    background: theme.panel,
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      opacity: shown ? land : 0,
                      transform: `scale(${shown ? 1 - (1 - land) * 0.05 + reveal.overshoot * land * (1 - land) * 4 : 0.95})`,
                    }}
                  >
                    {/* No camera move inside a cell: six crops drifting at
                        once is noise, not motion. */}
                    <MediaSlot slot={{ ...slot, label: undefined, camera_move: 'static' }} />
                  </div>
                </div>
                {hasCaptions ? (
                  <div
                    style={{
                      height: capZone,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      fontFamily: BODY_FONT,
                      fontWeight: 700,
                      fontSize: capFs,
                      lineHeight: 1.2,
                      color: theme.text,
                      opacity: capIn,
                      transform: `translateY(${(1 - capIn) * reveal.rise * u}px)`,
                    }}
                  >
                    {captions[i]}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
