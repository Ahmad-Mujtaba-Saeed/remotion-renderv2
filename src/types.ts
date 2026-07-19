// Shape of the shot list Laravel sends. Mirrors the PHP ExplainerRegistry /
// ShotListValidator output, so the validator on the PHP side is the contract.

export type ContentType =
  | 'image'
  | 'video'
  | 'text_block'
  | 'explanation_box'
  // Structured Tier A card contents (copilot.md §5, M4):
  | 'versus'
  | 'chart'
  | 'proscons'
  | 'icons'
  // Tier B (M5):
  | 'timeline_nodes'
  | 'steps'
  | 'ranking'
  | 'meter'
  // Tier C (M6):
  | 'map'
  | 'headlines'
  // Math explainer cards:
  | 'math_steps'
  | 'geometry'
  | 'function_plot';

/** One line of a worked math solution (math_steps card). `expr` is the
 *  linear math notation MathText typesets (frac{a}{b}, sqrt{...}, x^2, pi…);
 *  `note` is an optional ≤6-word margin note ("subtract 5 from both sides"). */
export interface MathStep {
  expr: string;
  note?: string;
  /**
   * The "as we know…" citation for THIS line — the formula or identity that
   * authorises the move ("L{y'} = sY - y(0)", "a^2 - b^2 = (a-b)(a+b)"),
   * written in the margin to the right of the step the way a lecturer does.
   * The card's `rule` panel names the one idea of the whole phase; this names
   * what a single line leans on. Typeset, so it may use the linear notation.
   */
  ref?: string;
  /**
   * Operation arrows drawn from atoms of the PREVIOUS line to atoms of THIS
   * line — a term moving across the equals sign, a product distributing onto
   * its results. `from`/`to` are short tokens exactly as written in each line
   * ("5", "x", "log_2", "x^2"); the renderer finds them and draws the curve.
   */
  arrows?: Array<{ from: string; to: string }>;
}

/** One actor in a scenario_diagram — a labelled box with an optional icon and
 *  its given value ("v = 20 km/min"). */
export interface ScenarioEntity {
  label: string;
  icon?: string;
  value?: string;
  /** Drawable subject for an AI cut-out sprite ("a red hatchback car"). */
  sprite?: string;
  /** Resolved alpha-PNG URL — when present the sprite replaces the icon box. */
  sprite_url?: string;
}

/** The relationship riding the gap between two adjacent entities. Positional:
 *  connector i sits between entity i and entity i+1. */
export interface ScenarioConnector {
  label?: string;
  sub?: string;
  style?: 'arrow' | 'line' | 'both';
}

/** The named rule a math_steps card is applying, shown in a panel beside the
 *  working: what it is called, the rule STATED generally, and one plain line
 *  on what it does. The steps show what happened; this says why it was
 *  allowed. */
export interface MathRule {
  name: string;
  formula?: string;
  why?: string;
}

/** One vertex of a geometry_diagram figure. Normalized 0..1, y UP (math
 *  convention — the renderer flips into screen space). */
export interface GeoPoint {
  x: number;
  y: number;
  label?: string;
}

/** A marked angle at vertex index `at` of a geometry figure. `right` draws
 *  the square marker instead of a sweeping arc. */
export interface AngleMark {
  at: number;
  label?: string;
  right?: boolean;
}

/** A labelled point of interest on a function_plot; y is computed from the
 *  expression so the mark always sits ON the curve. */
export interface PlotMark {
  x: number;
  label?: string;
}

/** A labelled point at parameter t (0..1) along edge `on_side` of a geometry
 *  figure — midpoints, feet of altitudes, points named in the problem. */
export interface EdgePoint {
  on_side: number;
  t: number;
  label?: string;
}

/** An internal segment of a geometry figure, drawn between two of its points
 *  (each a vertex label, a vertex index, or an extra_point label). */
export interface GeoSegment {
  from: string | number;
  to: string | number;
  label?: string;
  dashed?: boolean;
}

/** A real-coordinate point of a coordinate_plane figure (NOT normalized —
 *  these are the problem's own values, the renderer frames them). */
export interface PlanePoint {
  x: number;
  y: number;
  label?: string;
}

/** One dated stop on a timeline_card. */
export interface TimelineNode {
  date?: string;
  label?: string;
}

/** One side of a versus_card head-to-head. */
export interface VersusSide {
  label?: string;
  /** Up to 3 very short stat lines; numeric tokens count up. */
  stats?: string[];
}

export type ChartType =
  | 'bar'
  | 'line'
  | 'area'
  | 'donut'
  | 'pie'
  | 'scatter'
  | 'radar'
  | 'counter';

/** One cell of an icon_grid. `icon` must be a LUCIDE_ICONS name (the PHP
 *  validator whitelists; unknown names render as a generic dot). */
export interface IconItem {
  icon?: string;
  label?: string;
}

/** One press/reaction chip of a headline_ticker (§5.16). */
export interface HeadlineItem {
  text?: string;
  source?: string;
}

/** One labelled pin on a map_card (§5.15). Coordinates are real lat/lon;
 *  the renderer projects them with the same equirectangular projection the
 *  bundled world geometry was generated with. */
export interface MapPin {
  label?: string;
  lat?: number;
  lon?: number;
}

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
  | 'whip_pan'
  // Transitions 2.0 (copilot.md §3.1) — flat-safe, clip-path/transform only.
  | 'mask_wipe_circle'
  | 'mask_wipe_diagonal'
  | 'column_reveal'
  | 'split_slide'
  | 'stack_push'
  | 'line_sweep'
  | 'match_dissolve';

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
  /** Saliency focal point (§8 smart crop), 0..1 of the image — steers
      object-position when the slot covers so a crop never loses the subject. */
  focus?: { fx?: number; fy?: number } | null;
}

export interface Callout {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  text: string;
  anchor?: 'auto' | 'left' | 'right' | 'top' | 'bottom';
}

/** One labelled part of a formula_anatomy equation. `match` is an exact
 *  substring of the formula (same linear notation); the renderer finds its
 *  atoms in the typeset line and hangs the label off them. */
export interface FormulaPart {
  match: string;
  label: string;
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
  // versus (versus_card slot_versus)
  left?: VersusSide;
  right?: VersusSide;
  verdict?: string;
  // chart (animated_chart / big_counter)
  chart_type?: ChartType;
  labels?: string[];
  values?: number[];
  unit?: string;
  caption?: string;
  highlight_index?: number | null;
  source?: string;
  // proscons (checklist_card)
  pros?: string[];
  cons?: string[];
  pros_label?: string;
  cons_label?: string;
  // icons (icon_grid), steps (step_flow: {label, icon?}), ranking (strings),
  // headlines (headline_ticker: {text, source?})
  items?: (IconItem | HeadlineItem | string)[];
  // timeline_nodes (timeline_card)
  nodes?: TimelineNode[];
  // myth_fact (myth_fact card): the belief and its correction
  myth?: string;
  fact?: string;
  // meter (progress_meter)
  value_pct?: number;
  // pictogram (pictogram_percent): `filled` of `of` person icons in accent
  of?: number;
  filled?: number;
  // formula (formula_anatomy): one equation, parts labelled via leader lines
  formula?: string;
  parts?: FormulaPart[];
  // map (map_card)
  pins?: MapPin[];
  region?: string;
  route?: boolean;
  // math_steps (math_steps card)
  steps?: MathStep[];
  /** The named rule/law/identity these steps apply, shown in a side panel. */
  rule?: MathRule | null;
  // geometry (geometry_diagram): triangle | right_triangle | rectangle |
  // square | polygon | circle | angle | number_line | coordinate_plane |
  // fraction_bar
  shape?: string;
  points?: GeoPoint[];
  side_labels?: string[];
  angle_marks?: AngleMark[];
  radius_label?: string;
  center_label?: string;
  fill?: boolean;
  highlight_side?: number | null;
  /** Equal-side tick marks per edge (0-3, positional like side_labels). */
  side_ticks?: number[];
  /** Parallel-side chevron arrows per edge (0-2, positional). */
  side_arrows?: number[];
  /**
   * Squares erected OUTWARD on an edge, labelled with their area (positional
   * per edge, "" = no square). The Pythagoras figure and every "area sitting
   * on this side" argument. The figure auto-reframes to fit them.
   */
  side_squares?: string[];
  /**
   * Evolving figure (a drawn proof — Pythagoras, "area on each side"): the
   * erected squares (and the highlight/fill) stand up ONE AT A TIME in step
   * with the narration, instead of on a fixed timer, so "now a square on side
   * b" is spoken exactly as that square rises. Set by the composer when it
   * fuses an object + argument-step run into a single slide.
   */
  progressive?: boolean;
  /** Edge indices in the order their squares should reveal (narrative order,
   *  which need not be edge order). Falls back to edge order when absent. */
  reveal_order?: number[];
  /** Fraction of the narration reserved for the base figure before the first
   *  square rises (the "we start with a right triangle" opening). 0..0.5. */
  reveal_start_frac?: number;
  /** Explicit narration fraction (0..1) at which each square — in reveal_order
   *  — should rise, one per square. Set when the composer can line each square
   *  up with the step that introduces it; falls back to an even spread from
   *  reveal_start_frac when absent or mismatched. */
  reveal_fracs?: number[];
  /** Named points ON an edge (midpoints etc.). */
  extra_points?: EdgePoint[];
  /**
   * Internal segments drawn between two of the figure's points — a cevian, a
   * median, a diagonal, the parallel line that carves a similar triangle. Each
   * endpoint is a vertex LABEL, a vertex index, or an extra_point label.
   */
  segments?: GeoSegment[];
  /** Draw the circle through the figure's first three vertices — a triangle or
   *  polygon inscribed in its circumcircle ("angle in a semicircle", cyclic
   *  quadrilaterals). */
  circumcircle?: boolean;
  /**
   * area_model only: the binomial terms along the rows (and columns, unless
   * `col_terms` is given). `["a","b"]` builds the (a+b)² square carved into
   * a² / ab / ab / b². `col_terms` differing gives a rectangle product
   * (a+b)(c+d).
   */
  terms?: string[];
  col_terms?: string[];
  /** coordinate_plane: real-value points + optional line through two of them. */
  coords?: PlanePoint[];
  line_through?: number[];
  /** Slope triangle: dashed Δx/Δy legs between the two line_through points. */
  rise_run?: boolean;
  /** number_line: accent segment between two values. */
  segment?: { from?: number; to?: number } | null;
  /** fraction_bar: numerator/denominator cells. */
  numerator?: number;
  denominator?: number;
  /** unit_circle: a radius swung to angle_deg, optionally a second at
   *  angle2_deg (one angle becoming another — rotations, De Moivre). */
  angle_deg?: number;
  angle2_deg?: number;
  angle_label?: string;
  angle2_label?: string;
  point_label?: string;
  show_coords?: boolean;
  /** scenario (scenario_diagram): the word-problem setup drawing. */
  entities?: ScenarioEntity[];
  connectors?: ScenarioConnector[];
  question?: string;
  /** scenario: the SHAPE of the sketch — 'line' (default), 'arc' (up and
   *  back down: projectiles), 'climb' (rising), 'fall' (dropping). */
  layout?: string;
  // function_plot: y = f(x) in calculator syntax; marks sit on the curve
  expression?: string;
  /** Optional second curve (comparisons/intersections), drawn in ink. */
  expression2?: string;
  /** Tangent-line touch point (slope/derivative beats). */
  tangent_at?: number | null;
  /** Under-curve shaded region (integral/area beats). */
  shade?: { from?: number; to?: number } | null;
  x_min?: number;
  x_max?: number;
  marks?: PlotMark[];
  // phone_mockup: which flat CSS device frame wraps the screen media
  frame?: 'phone' | 'browser';
  // floating panel / banner config
  dock?: Dock;
  width_pct?: number;
  /** Split-layout balance (validator, copilot.md §7.3): when the paired slot
      is sparse text, the media slot is promoted to this share of the axis
      (e.g. 65) so the frame never sits mostly empty. */
  emphasis_pct?: number;
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
export type TextStyleVariant =
  | 'editorial'
  | 'statement'
  | 'numbered'
  | 'checklist'
  | 'cards'
  /** explanation_box only: per-character reveal with a block caret (§4.5). */
  | 'typewriter';

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
  /** Story relation to the previous scene (analyzer, validator-normalised).
      Drives the signature transition + the flavour of the cut's SFX. */
  relation?: SceneRelation;
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
  /** First media slot's saliency focus — the mask_wipe_circle reveal origin. */
  focus?: { fx?: number; fy?: number } | null;
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

export type CompositionMode = 'canvas_journey' | 'slides' | 'hybrid' | 'math_board';

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
  /** Optional per-chapter accent override (§11.4 accent shift) — a hue-
      rotated accent computed server-side; no runtime filters. */
  accent?: string | null;
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
  /** Sound-effects layer config (whooshes/pops/impacts). Defaults to on.
      `pack` is resolved by render.ts against the filesystem — 'studio' only
      survives when public/sfx/studio/ carries the complete manifest. */
  sfx?: { enabled?: boolean; volume?: number; pack?: string } | null;
  /** Optional single narration track (one TTS request) spanning the whole video. */
  narration_audio_url?: string | null;
  /** Karaoke caption track (copilot.md §4.4) — screen-space word chips synced
      to narration_words. Laravel defaults it on for 9:16, off for 16:9. */
  captions?: { enabled?: boolean } | null;
  /** Active font pack name ('editorial' | 'classic' | 'tech'); resolved by
      Laravel ('auto' never reaches the renderer). Missing = editorial. */
  font_pack?: string | null;
  /** Motion style preset (§2.5): crisp | classic | bounce | elegant | swiss.
      Resolved by Laravel ('auto' never ships). Missing = crisp. */
  motion_style?: string | null;
  /** Surface skin (§11.2): flat | outline | print. Missing = flat. */
  skin?: string | null;
  /** Chapter progress chip (§10.3): a mono `02 / 06` at the kicker position,
      screen-space, hybrid mode only. Laravel defaults it off. */
  chapter_chip?: { enabled?: boolean } | null;
  /** Brand kit (§10.4): logo watermark bottom-right at 6% opacity, screen
      space, outside every camera world. The brand COLOUR never reaches the
      renderer — Laravel folds it into theme.accent when it passes contrast. */
  brand?: { logo_url?: string | null } | null;
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
