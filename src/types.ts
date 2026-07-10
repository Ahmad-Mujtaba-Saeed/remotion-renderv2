// Shape of the shot list Laravel sends. Mirrors the PHP ExplainerRegistry /
// ShotListValidator output, so the validator on the PHP side is the contract.

export type ContentType = 'image' | 'video' | 'text_block' | 'explanation_box';

export type Dock = 'left' | 'right' | 'top' | 'bottom';

export type CameraMove =
  | 'static'
  | 'slow_zoom_in'
  | 'slow_zoom_out'
  | 'pan_left'
  | 'pan_right'
  | 'pan_up'
  | 'pan_down'
  | 'ken_burns'
  | 'ken_burns_reverse'
  | 'push_in'
  | 'pull_out'
  | 'tilt_zoom'
  | 'zoom_in_snap'
  | 'pan_up_zoom_in'
  | 'hover';

export type TransitionType =
  | 'none'
  | 'fade'
  | 'push_left'
  | 'push_right'
  | 'push_up'
  | 'push_down'
  | 'wipe'
  | 'wipe_up'
  | 'zoom_through'
  | 'zoom_out_in'
  | 'whip_pan';

/**
 * A pre-extracted JPEG frame sequence for a slot video. Rendering stills via
 * <Img> is fully deterministic — no <video> seeking, so no stuck/step-back
 * frames ever. Backend extracts once per upload (idempotent) and ships this.
 */
export interface FrameSequence {
  /** URL prefix; frame N (1-based) lives at `${url_prefix}${NNNNN}.jpg`. */
  url_prefix: string;
  count: number;
  fps: number;
}

export interface AssetRef {
  url?: string;
  path?: string;
  type?: string;
  /** Real media duration (ffprobe, backend) so videos can loop safely. */
  duration_seconds?: number | null;
  /** Real pixel dimensions (backend probe) so slots can fit, not crop. */
  width?: number | null;
  height?: number | null;
  /** Optional extracted frame sequence (preferred over <Video> when present). */
  frames?: FrameSequence | null;
}

export interface Callout {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  text: string;
  anchor?: 'auto' | 'left' | 'right' | 'top' | 'bottom';
}

export interface Slot {
  content_type: ContentType;
  label?: string;
  // image
  camera_move?: CameraMove;
  asset_request?: { description?: string };
  asset_ref?: AssetRef | null;
  callouts?: Callout[];
  callout_suggestions?: string[];
  // text_block
  heading?: string;
  bullets?: string[];
  reveal?: 'sequential' | 'all_at_once';
  // explanation_box
  body?: string;
  // floating panel / banner config
  dock?: Dock;
  width_pct?: number;
}

/** One spoken word with its real timestamps (seconds, relative to the scene's
 *  narration audio start). Comes from Kokoro's token timings on the backend. */
export interface NarrationWord {
  word: string;
  start: number;
  end: number;
}

export type PunchlineStyle = 'plate' | 'glass' | 'stamp' | 'quote';

/**
 * A short, impactful phrase lifted VERBATIM from the scene's narration that
 * pops on screen (with its own backdrop) exactly as the narrator says it,
 * highlighting word by word. Backend extracts + aligns it to word timings.
 */
export interface Punchline {
  text: string;
  style?: PunchlineStyle;
  /** Seconds relative to narration start. */
  start: number;
  end: number;
  /** Aligned per-word timings; may be evenly distributed when unaligned. */
  words: NarrationWord[];
}

/**
 * How a text card presents itself — the scene stylist (LLM pass on the PHP
 * side, seeded fallback otherwise) hands every scene a personality so a long
 * video never repeats one look.
 */
export type TextStyleVariant = 'editorial' | 'statement' | 'numbered' | 'checklist' | 'cards';

export interface SceneStyle {
  variant?: TextStyleVariant;
  /** Tiny uppercase eyebrow line above the heading (e.g. "THE PROBLEM"). */
  kicker?: string;
  /** Heading words to paint with the accent gradient (verbatim matches). */
  highlight?: string[];
}

export interface Scene {
  scene_id: string;
  order: number;
  duration_seconds: number;
  narration?: { text?: string };
  layout_template: string;
  transition?: TransitionType;
  /** Per-scene presentation personality (variant, kicker, highlights). */
  style?: SceneStyle | null;
  slots: Record<string, Slot>;
  /** Optional AI-generated decorative background URL (text-only scenes). */
  ambient_image_url?: string;
  /** Optional AI-generated illustration URL — pairs with the copy on
      media-less scenes so they never render as bare floating text. */
  illustration_url?: string;
  /** Optional fal Chatterbox narration audio URL. */
  narration_audio_url?: string;
  /** Real word-level timings of the narration audio (Kokoro tokens). */
  narration_words?: NarrationWord[];
  /** Optional narration-synced punchline overlay. */
  punchline?: Punchline | null;
}

export interface Theme {
  name: string;
  label: string;
  bg_from: string;
  bg_to: string;
  accent: string;
  accent2: string;
  text: string;
  muted: string;
  panel: string;
}

/** Curated background-music track Laravel selects by dominant scene mood. */
export interface Music {
  url: string;
  volume: number;
  mood?: string;
}

// ---------------------------------------------------------------------------
// Cinematic canvas journey (Prezi-style world the camera flies across).
// Mirrors the PHP CanvasPlanValidator output — that validator is the contract.
// ---------------------------------------------------------------------------

export type CompositionMode = 'canvas_journey' | 'slides' | 'hybrid';

export type HoldMove = 'breathe' | 'push_in' | 'drift' | 'orbit' | 'rise' | 'sway' | 'settle_back';

/** How the camera reaches (and treats) a scene — the motion language. */
export type Treatment =
  | 'hero_open'
  | 'canvas_hop'
  | 'zoom_nest'
  | 'overlay_focus'
  | 'kinetic_break'
  | 'pull_reveal';

export type PropAnimation = 'float' | 'pulse' | 'orbit' | 'pop_spring' | 'drift' | 'draw_in';

/**
 * A small AI-generated decoration floating around a scene region. Generated
 * on a pure black background and drawn with mix-blend-mode: screen so black
 * disappears on the dark canvas themes.
 */
export interface CanvasProp {
  prompt?: string;
  url?: string;
  path?: string;
  animation?: PropAnimation;
  /** Position in region space; slightly outside 0..1 scatters beside it. */
  x?: number;
  y?: number;
  /** Fraction of the region's short side. */
  size?: number;
}

/** How a scene relates to the story so far — drives the camera's flight style. */
export type SceneRelation =
  | 'opening'
  | 'continues'
  | 'elaborates'
  | 'consequence'
  | 'contrast'
  | 'callback'
  | 'new_chapter';

/** A scene's frameless composition region on the world canvas (x/y = center). */
export interface CanvasItem {
  scene_id: string;
  treatment?: Treatment;
  /** Story relation to the previous scene (validator-normalised). */
  relation?: SceneRelation;
  /** For relation "callback": the earlier scene this one returns to. */
  callback_to?: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Deprecated (v1 tilted-card look); always 0 in v2 plans. */
  rotation?: number;
  emphasis?: 'hero' | 'normal';
  hold_move?: HoldMove;
  props?: CanvasProp[];
  /** 0 = on the canvas, 1+ = physically nested inside the previous scene. */
  depth?: number;
  parent_id?: string | null;
}

export type ConnectorStyle = 'dotted' | 'arrow' | 'none' | 'curve' | 'straight';

export interface CanvasConnector {
  from: string;
  to: string;
  style?: ConnectorStyle;
  label?: string;
  relation?: SceneRelation;
}

export interface CanvasPlan {
  version?: number;
  journey_pattern?: string;
  world: { width: number; height: number };
  items: CanvasItem[];
  connectors: CanvasConnector[];
}

// ---------------------------------------------------------------------------
// Hybrid chapters: the video is a sequence of chapters, each rendered as its
// own canvas journey (with its OWN world plan) or its own slides run, joined
// by ordinary scene transitions. Mirrors the PHP ChapterPlanValidator output.
// ---------------------------------------------------------------------------

export type ChapterMode = 'canvas' | 'slides';

export interface Chapter {
  id?: string;
  mode: ChapterMode;
  /** Scene ids this chapter covers — a contiguous run in storyboard order. */
  scene_ids: string[];
  /** Transition INTO this chapter (ignored on the first chapter). */
  transition_in?: TransitionType;
  /** Canvas chapters: this chapter's own world plan. */
  canvas?: CanvasPlan | null;
}

export interface ChapterPlan {
  version?: number;
  chapters: Chapter[];
}

export interface ShotList {
  project_id: string;
  aspect_ratio?: string;
  theme?: Theme;
  /** Optional curated background music for the whole video. */
  music?: Music | null;
  /** Sound-effects layer config (whooshes/pops/impacts). Defaults to on. */
  sfx?: { enabled?: boolean; volume?: number } | null;
  /** Optional single narration track (one TTS request) spanning the whole video. */
  narration_audio_url?: string | null;
  /** How to compose: canvas journey, classic slides, or chaptered hybrid. */
  composition_mode?: CompositionMode;
  /** The Canvas Director's world plan (canvas_journey mode). */
  canvas?: CanvasPlan | null;
  /** The Composition Director's chapter plan (hybrid mode). */
  chapters?: ChapterPlan | null;
  scenes: Scene[];
}

/**
 * Old payloads carry none of these fields — they keep the classic slides
 * behaviour. New payloads always carry composition_mode from Laravel.
 */
export const resolveCompositionMode = (shotList?: ShotList | null): CompositionMode => {
  if (!shotList) return 'slides';
  if (shotList.composition_mode) return shotList.composition_mode;
  if (shotList.chapters?.chapters?.length) return 'hybrid';
  return shotList.canvas ? 'canvas_journey' : 'slides';
};

export interface ExplainerProps {
  shotList: ShotList;
  fps: number;
  width: number;
  height: number;
}

/** Mirrors the `midnight` entry in explainer_registry.json. Flat field:
 *  bg_from === bg_to, opaque panel — no gradient, no translucency. */
export const DEFAULT_THEME: Theme = {
  name: 'midnight',
  label: 'Midnight',
  bg_from: '#0A0F1E',
  bg_to: '#0A0F1E',
  accent: '#FFB020',
  accent2: '#FF7A45',
  text: '#EDF0F8',
  muted: '#838CA2',
  panel: '#121A2E',
};

export const TRANSITION_SECONDS = 0.55;
