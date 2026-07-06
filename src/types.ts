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
  | 'push_in'
  | 'pull_out'
  | 'tilt_zoom';

export type TransitionType =
  | 'none'
  | 'fade'
  | 'push_left'
  | 'push_right'
  | 'push_up'
  | 'wipe'
  | 'zoom_through';

export interface AssetRef {
  url?: string;
  path?: string;
  type?: string;
  /** Real media duration (ffprobe, backend) so videos can loop safely. */
  duration_seconds?: number | null;
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

export interface Scene {
  scene_id: string;
  order: number;
  duration_seconds: number;
  narration?: { text?: string };
  layout_template: string;
  transition?: TransitionType;
  slots: Record<string, Slot>;
  /** Optional AI-generated decorative background URL (text-only scenes). */
  ambient_image_url?: string;
  /** Optional fal Chatterbox narration audio URL. */
  narration_audio_url?: string;
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

export type CompositionMode = 'canvas_journey' | 'slides';

export type HoldMove = 'breathe' | 'push_in' | 'drift';

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

export interface ShotList {
  project_id: string;
  aspect_ratio?: string;
  theme?: Theme;
  /** Optional curated background music for the whole video. */
  music?: Music | null;
  /** Optional single narration track (one TTS request) spanning the whole video. */
  narration_audio_url?: string | null;
  /** How to compose: one continuous camera journey vs. classic slide transitions. */
  composition_mode?: CompositionMode;
  /** The Canvas Director's world plan (canvas_journey mode). */
  canvas?: CanvasPlan | null;
  scenes: Scene[];
}

/**
 * Old payloads carry neither field — they keep the classic slides behaviour.
 * New payloads always carry composition_mode from Laravel.
 */
export const resolveCompositionMode = (shotList?: ShotList | null): CompositionMode => {
  if (!shotList) return 'slides';
  if (shotList.composition_mode) return shotList.composition_mode;
  return shotList.canvas ? 'canvas_journey' : 'slides';
};

export interface ExplainerProps {
  shotList: ShotList;
  fps: number;
  width: number;
  height: number;
}

export const DEFAULT_THEME: Theme = {
  name: 'midnight',
  label: 'Midnight',
  bg_from: '#0f172a',
  bg_to: '#1e293b',
  accent: '#38bdf8',
  accent2: '#818cf8',
  text: '#f8fafc',
  muted: '#94a3b8',
  panel: 'rgba(15,23,42,0.62)',
};

export const TRANSITION_SECONDS = 0.55;
