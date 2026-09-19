/**
 * The contract for the `ViralShort` composition — the Long Video to Shorts
 * editor's renderer. Laravel (Services/Shorts/ViralShortRenderService) builds
 * this object; nothing here is decided by the renderer that the backend did
 * not already decide, so a render is reproducible from its props alone.
 *
 * Time: captions, events and the hook are in OUTPUT seconds — the backend
 * owns the timeline and has already mapped them through `segments` (speed
 * ramps and freeze frames live there). Only `CropKey.t` is in SOURCE seconds,
 * because a following crop tracks what is in the footage; the renderer maps
 * output time back to source time to look it up.
 */

export type Box = [number, number, number, number]; // x, y, w, h — fractions

/** One camera sample for a following crop: where the crop is centred. */
export interface CropKey {
  t: number;
  cx: number;
  cy: number;
  /** A hard cut: jump to this position instead of gliding into it. */
  jump?: boolean;
}

export interface Panel {
  /** Where the panel sits on the 1080x1920 canvas, as fractions. */
  dest: Box;
  /** Which video feeds it. */
  source: 'main' | 'gameplay';
  /** Static crop window in source fractions (its aspect is re-fit to dest). */
  crop?: Box;
  /** Following crop: centre over time + the crop's WIDTH as a source fraction. */
  track?: { keys: CropKey[]; width: number };
  /** cover (default) crops to fill; contain letterboxes over a blurred copy. */
  fit?: 'cover' | 'contain';
  /** The panel the camera effects (punch-in zooms) act on. */
  primary?: boolean;
  radius?: number;
  border?: string;
  label?: string;
  /**
   * The crop is an overlay inset (a webcam): re-fit it to the panel by
   * trimming INSIDE the box, never by growing past it, or the game around
   * the webcam leaks into the panel.
   */
  inset?: boolean;
}

export interface Layout {
  kind: string;
  panels: Panel[];
  background: 'blur' | 'black' | 'gradient';
  divider?: { color: string; thickness: number } | null;
}

export interface Segment {
  /** Source start (s). */
  src: number;
  /** Output length (s). */
  dur: number;
  /** Playback rate; ignored for freezes. */
  rate: number;
  freeze?: boolean;
}

export interface CaptionWord {
  text: string;
  start: number;
  end: number;
  /** Director-picked: colour this word with the highlight colour. */
  key?: boolean;
  emoji?: string;
}

export interface CaptionStyle {
  font: 'bricolage' | 'fraunces' | 'grotesk' | 'inter' | 'mono' | 'impact';
  weight: number;
  size: number; // px at 1080 wide
  uppercase: boolean;
  lowercase?: boolean;
  wordsPerLine: number;
  color: string;
  highlight: string;
  keyColor: string;
  highlightMode: 'color' | 'box' | 'scale' | 'underline' | 'none';
  stroke: number;
  strokeColor: string;
  shadow: boolean;
  animation: 'pop' | 'bounce' | 'fade' | 'slide' | 'typewriter' | 'karaoke';
  /** Vertical centre of the caption block, fraction of height. */
  y: number;
  background?: string | null;
  rotate?: number;
}

export interface HookStyle {
  /**
   * banner/bubble/bold/tape are designed title cards; `native` imitates the
   * in-app TikTok text box and `plain` is white text with a soft shadow — the
   * two looks a person editing on their phone actually produces.
   */
  style: 'banner' | 'bubble' | 'bold' | 'tape' | 'native' | 'plain' | 'none';
  bg: string;
  color: string;
  font: CaptionStyle['font'];
  y: number;
  /** Per-short hand-placed feel: size multiplier, tilt (deg), alignment. */
  scale?: number;
  rotate?: number;
  align?: 'left' | 'center';
}

export interface ShortStyle {
  id: string;
  name: string;
  caption: CaptionStyle;
  hook: HookStyle;
  grade: { filter: string; vignette: number; tint?: string | null };
  progress: { position: 'top' | 'bottom' | 'none'; color: string; height: number };
  sfxVolume: number;
  accent: string;
  /** Slow baseline push on the primary panel over the whole short (1 = none). */
  drift: number;
  stickerFont: CaptionStyle['font'];
}

export type ShortEvent =
  | { type: 'zoom'; start: number; end: number; scale: number; anchor?: 'face' | 'center' }
  | { type: 'shake'; start: number; end: number; intensity: number }
  | { type: 'flash'; start: number; color?: string; duration?: number }
  | { type: 'emoji'; start: number; end: number; emoji: string; x: number; y: number; size?: number }
  | {
      type: 'sticker';
      start: number;
      end: number;
      text: string;
      x: number;
      y: number;
      rotate?: number;
      variant?: 'meme' | 'bubble' | 'label' | 'impact';
    }
  /**
   * A line of explanation from the editor, not from anyone on screen: the
   * context a viewer who did not watch the stream is missing ("he just ate the
   * world's hottest wing"). Rendered as a card that is deliberately NOT in the
   * caption style, so nobody reads it as something that was said.
   */
  | { type: 'context'; start: number; end: number; text: string; icon?: string; place?: 'top' | 'bottom' }
  | { type: 'glitch'; start: number; end: number }
  /** The primary (streamer cam) panel grows to fill the screen, then goes back. */
  | { type: 'takeover'; start: number; end: number; dest?: Box }
  | { type: 'bw'; start: number; end: number }
  | { type: 'sfx'; start: number; name: string; volume?: number }
  /** A narrator line (TTS). The clip's own audio ducks under it. */
  | { type: 'voice'; start: number; end: number; url: string; volume?: number; duck?: number }
  | { type: 'broll'; start: number; end: number; url: string; kind: 'image' | 'video'; mode: 'full' | 'pip' };

export interface ShortProps {
  width: number;
  height: number;
  fps: number;
  video: { url: string; width: number; height: number; duration: number };
  gameplay?: { url: string; startFrom: number; duration: number } | null;
  segments: Segment[];
  layout: Layout;
  style: ShortStyle;
  words: CaptionWord[];
  captionsEnabled: boolean;
  hook?: { text: string; emoji?: string | null; until: number } | null;
  events: ShortEvent[];
  /** Background music bed (already ducked by volume). */
  music?: { url: string; volume: number } | null;
  sourceVolume?: number;
}
