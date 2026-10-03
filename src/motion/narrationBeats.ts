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
  /**
   * The items' own words. When given, each item lands where the narrator
   * actually SAYS it (content match, see `alignTexts`) and the word-share
   * split is only the fallback for items the voice never names. Without this
   * a list whose first point takes two thirds of the sentence showed point
   * two a full clause early — the "a little out of sync" on project 211.
   */
  texts?: string[];
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
  { first, last, minGap, maxGap, texts }: BeatOptions
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

  const aligned = texts && texts.length === count ? alignTexts(list, texts) : null;
  const raw = Array.from({ length: count }, (_, i) => {
    const at = aligned?.[i];
    // Lead the spoken word by ~0.2s, the way an editor cuts a hair early.
    if (at != null) return Math.round(Math.max(0, list[at].start - 0.2) * fps);
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
 * A light plural stem, so "antibody" matches a spoken "antibodies" and
 * "glass" a spoken "glasses". Mirrored exactly by the PHP side
 * (Support\CinematicScene::stem) so the server's cue check and the renderer's
 * timing agree on what counts as said.
 */
const stem = (w: string): string => {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

/**
 * The frame the narrator first says `phrase`, or null if they never do.
 *
 * Matching is prefix-based on the phrase's FIRST word, which is how a spoken
 * "gates" matches the cue "gate" and "recycling," matches "recycling". A
 * multi-word phrase only has to hit its opening word — a narrator rarely says a
 * card's label back verbatim, and waiting for an exact run means never firing.
 *
 * The reverse direction (a spoken word SHORTER than the cue: "gate" said for
 * the cue "gates") only counts when the two differ by an inflection — at most
 * two letters. Without that bound every cue fired on the first stub word that
 * prefixed it: "antibodies" landed on the spoken "a", "island" on "is".
 */
export const spokenAt = (
  words: NarrationWord[] | undefined,
  phrase: string,
  fps: number
): number | null => {
  const cue = norm((phrase || '').split(/\s+/)[0] ?? '');
  if (!cue || cue.length < 3) return null;
  const cueStem = stem(cue);
  const hit = (words ?? []).find((w) => {
    const n = norm(w.word);
    return (
      n.startsWith(cue) ||
      (n.length >= 3 && n.length >= cue.length - 2 && cue.startsWith(n)) ||
      (cueStem.length >= 3 && stem(n).startsWith(cueStem))
    );
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

const STOP = new Set(
  ('the and that this with from they them their there then than what when where which while have has had were was are ' +
   'been being into onto over under about your you our its for not but can just only also more most very some such ' +
   'each other these those does did doing done make makes made like even still much many who whom whose will would ' +
   'could should one two three first second study studies research researchers people').split(' ')
);

/** Content words of a card row, stemmed: what the voice would have to say. */
const keyWords = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9'-]+/)
    .map((w) => w.replace(/'s$/, ''))
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .map(stem);

/**
 * Where in the narration each item is spoken: the index of the first word of
 * the best-matching run, or null when the voice never says it.
 *
 * Items are matched IN ORDER (a list is read top to bottom), so the search for
 * item i starts after item i−1's hit. The score of a start position is how
 * many of the item's key words appear in the next ~14 spoken words; ties go
 * to the earliest. One shared key word is enough when the item has only one
 * or two, two are required otherwise, so a common word like "brain" cannot
 * drag a row to the wrong clause.
 */
export const alignTexts = (words: NarrationWord[], texts: string[]): (number | null)[] => {
  const spoken = words.map((w) => stem(norm(w.word)));
  const out: (number | null)[] = [];
  let from = 0;
  for (const text of texts) {
    const keys = [...new Set(keyWords(text))];
    if (keys.length === 0) { out.push(null); continue; }
    const need = keys.length <= 2 ? 1 : 2;
    let best = -1;
    let bestScore = 0;
    for (let i = from; i < spoken.length; i++) {
      if (!keys.some((k) => spoken[i].startsWith(k) || (k.startsWith(spoken[i]) && spoken[i].length >= 4))) continue;
      const window = spoken.slice(Math.max(from, i - 3), i + 14);
      const score = keys.filter((k) => window.some((w) => w.startsWith(k) || (k.startsWith(w) && w.length >= 4))).length;
      if (score > bestScore) { bestScore = score; best = i; }
      if (bestScore === keys.length) break;
    }
    if (best < 0 || bestScore < need) { out.push(null); continue; }
    // Back up to the start of the clause the hit sits in (≤3 words), so the
    // row appears as the phrase begins rather than on its third word.
    let at = best;
    for (let j = best - 1; j >= Math.max(from, best - 3); j--) {
      if (/[.,;:!?]$/.test(words[j].word)) break;
      at = j;
    }
    out.push(at);
    from = best + 1;
  }
  return out;
};
