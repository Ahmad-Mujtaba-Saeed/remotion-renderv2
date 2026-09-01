import { NarrationWord } from '../types';

/**
 * NARRATION BEATS — when the frame is allowed to change.
 *
 * A scene that reveals its content on a metronome is a slideshow with a timer:
 * the third bullet lands at 60% of the scene whether the narrator reached it or
 * not. A scene that reveals on the VOICE tracks the sentence through its own
 * pauses and long clauses, and the frame is then still changing at the ninth
 * second because the narrator is still talking.
 *
 * `MathSteps` worked this out first and `CustomCard` grew its own copy of the
 * word lookup. This is that logic extracted once, so a card that wants to ride
 * the narration does not have to re-derive the clamping rules — which is where
 * the bugs are: a beat before the heading has settled, two beats on adjacent
 * frames, or a last beat so late the viewer never reads it.
 *
 * Both helpers degrade to silence: with no word timings (`narration_words` is
 * absent whenever TTS ran without them) `beatFrames` returns the even spread
 * the cards used before, so nothing about those renders changes.
 */

export interface BeatOptions {
  /** Earliest frame any beat may land (after the heading settles). */
  first: number;
  /** Latest frame the LAST beat may land — leave the viewer time to read it. */
  last: number;
  /** Minimum frames between beats, so two never land together. */
  minGap: number;
  /**
   * Optional ceiling on the gap of the EVEN fallback. Without word timings a
   * long scene with three items would otherwise stretch them across the whole
   * hold; a card that would rather group them early (math_steps: working is
   * one thought, not three) caps the spacing here.
   */
  maxGap?: number;
}

/**
 * Landing frames for `count` items, one per share of the narration.
 *
 * Item i is assigned the moment its share of the spoken words BEGINS — not its
 * midpoint, so the reveal leads the sentence slightly, the way an editor cuts a
 * hair early. The result is then clamped monotonic: no beat before `first`, no
 * two closer than `minGap`, none past `last`.
 *
 * @param words Scene narration words (`scene.narration_words`), may be empty.
 * @param fps   Render frame rate — word timings are in seconds.
 */
export const beatFrames = (
  words: NarrationWord[] | undefined,
  count: number,
  fps: number,
  { first, last, minGap, maxGap }: BeatOptions
): number[] => {
  if (count <= 0) return [];

  const lastOk = Math.max(first + minGap * Math.max(0, count - 1), last);

  // Even spread — the fallback, and the whole answer when there are fewer
  // words than items (a three-word sentence cannot pace five bullets).
  const even = (): number[] => {
    if (count === 1) return [first];
    let gap = Math.max(minGap, (lastOk - first) / (count - 1));
    if (maxGap !== undefined) gap = Math.min(gap, Math.max(minGap, maxGap));
    return Array.from({ length: count }, (_, i) => Math.round(first + i * gap));
  };

  const list = words ?? [];
  if (list.length < count || count < 2) return even();

  const raw = Array.from({ length: count }, (_, i) => {
    const w = list[Math.floor((i * list.length) / count)];
    return Math.round((w?.start ?? 0) * fps);
  });

  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const floor = i === 0 ? first : out[i - 1] + minGap;
    // The ceiling walks back from `lastOk` so that even a narration whose words
    // all cluster at the end still leaves room for the beats after this one.
    const ceil = lastOk - (count - 1 - i) * minGap;
    out.push(Math.round(Math.min(Math.max(raw[i], floor), Math.max(floor, ceil))));
  }
  return out;
};

/** Normalised for matching: lower case, letters/digits/hyphen only. */
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9-]/g, '');

/**
 * The frame the narrator first says `phrase`, or null if they never do.
 *
 * Matching is prefix-based on the phrase's FIRST word, which is how a spoken
 * "gates" matches the cue "gate" and "recycling," matches "recycling". A
 * multi-word phrase only has to hit its opening word — a narrator rarely says a
 * card's label back verbatim, and waiting for an exact run means never firing.
 */
export const spokenAt = (
  words: NarrationWord[] | undefined,
  phrase: string,
  fps: number
): number | null => {
  const cue = norm((phrase || '').split(/\s+/)[0] ?? '');
  if (!cue || cue.length < 3) return null;
  const hit = (words ?? []).find((w) => {
    const n = norm(w.word);
    return n.startsWith(cue) || cue.startsWith(n);
  });
  return hit ? Math.round(hit.start * fps) : null;
};

/**
 * Which item is the one the voice is on at `frame`, given their landing
 * frames: the latest that has landed, or -1 before the first.
 */
export const activeBeat = (landAt: number[], frame: number): number => {
  let active = -1;
  for (let i = 0; i < landAt.length; i++) {
    if (frame >= landAt[i]) active = i;
  }
  return active;
};
