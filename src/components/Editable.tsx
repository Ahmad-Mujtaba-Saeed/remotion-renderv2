import React, { createContext, useContext, useMemo } from 'react';
import { useVideoConfig } from 'remotion';
import type { ElementEdit, ElementEdits, Scene, Slot } from '../types';
import { useIsGhost } from '../motion/ghost';

/**
 * EDITABLE ELEMENTS — the renderer half of the storyboard's click-to-edit
 * stage.
 *
 * A layout marks the things a person would want to grab (the card itself, a
 * heading, a bullet, a picture) by spreading `edit(id, style)` onto the
 * element instead of a bare `style`. That does two things:
 *
 *  1. applies the scene's hand edit for that id, if there is one — offset,
 *     scale, rotation, colour, weight, case, alignment, opacity, hidden;
 *  2. tags the element with `data-edit-id` / `data-edit-scene`, which is how
 *     the dashboard's stage overlay finds what was clicked. The tags are inert
 *     in the headless render.
 *
 * It is the SAME code in the browser preview and the MP4 (the dashboard runs a
 * mirror of this tree), so an edit looks identical in both by construction —
 * there is no second implementation of "move the heading" to drift.
 *
 * Offsets are fractions of the FRAME, applied in the element's own coordinate
 * space. The canvas journey and the math board draw layouts at design
 * resolution and scale the result, so a fraction of the frame means the same
 * thing in every mode and every aspect variant.
 *
 * Ids are stable, human-readable paths: `card`, `heading`, `kicker`,
 * `<slot>.heading`, `<slot>.bullets.2`, `<slot>.media`. An edit whose element
 * no longer exists (the card was regenerated) is simply never applied.
 */

type EditsContextValue = {
  sceneId: string | null;
  edits: ElementEdits;
  slots: Record<string, Slot>;
};

const EditsContext = createContext<EditsContextValue>({ sceneId: null, edits: {}, slots: {} });

export const ElementEditsProvider: React.FC<{ scene: Scene; children: React.ReactNode }> = ({
  scene,
  children,
}) => {
  const value = useMemo<EditsContextValue>(
    () => ({
      sceneId: scene.scene_id ?? null,
      edits: scene.element_edits && typeof scene.element_edits === 'object' ? scene.element_edits : {},
      slots: scene.slots ?? {},
    }),
    [scene.scene_id, scene.element_edits, scene.slots]
  );
  return <EditsContext.Provider value={value}>{children}</EditsContext.Provider>;
};

/** The key a slot object lives under in its scene, or '' when it was rebuilt. */
export const useSlotKey = (slot: Slot | undefined | null): string => {
  const { slots } = useContext(EditsContext);
  return useMemo(() => {
    if (!slot) return '';
    for (const [key, value] of Object.entries(slots)) {
      if (value === slot) return key;
    }
    // Layouts sometimes hand a shallow copy down; match on what identifies it.
    for (const [key, value] of Object.entries(slots)) {
      if (
        value?.content_type === slot.content_type &&
        (value?.heading ?? null) === (slot.heading ?? null) &&
        (value?.asset_ref?.url ?? null) === (slot.asset_ref?.url ?? null)
      ) {
        return key;
      }
    }
    return '';
  }, [slot, slots]);
};

/** `slot.field` when the slot is known, else the bare field. */
export const editId = (slotKey: string, field: string): string => (slotKey ? `${slotKey}.${field}` : field);

/** text: styled + reworded · group: a row of text, styled but not reworded. */
export type EditKind = 'text' | 'group' | 'media' | 'card' | 'shape';

export type EditProps = {
  style: React.CSSProperties;
  'data-edit-id'?: string;
  'data-edit-scene'?: string;
  'data-edit-kind'?: EditKind;
};

type EditOptions = {
  kind?: EditKind;
  /** The element is inline by default (a span): transforms need inline-block. */
  inline?: boolean;
};

const clampNum = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
};

const CASES: Record<string, React.CSSProperties['textTransform']> = {
  upper: 'uppercase',
  lower: 'lowercase',
  title: 'capitalize',
  none: 'none',
};

/** Pure: a layout's style with one hand edit laid over it. */
export const applyEdit = (
  style: React.CSSProperties,
  e: ElementEdit,
  frameW: number,
  frameH: number,
  opts: EditOptions = {}
): React.CSSProperties => {
  if (e.hidden) return { ...style, display: 'none' };

  const out: React.CSSProperties = { ...style };
  const x = clampNum(e.x, -1.5, 1.5, 0);
  const y = clampNum(e.y, -1.5, 1.5, 0);
  const scale = clampNum(e.scale, 0.2, 5, 1);
  const rotate = clampNum(e.rotate, -180, 180, 0);

  const parts: string[] = [];
  if (x || y) parts.push(`translate(${(x * frameW).toFixed(2)}px, ${(y * frameH).toFixed(2)}px)`);
  if (rotate) parts.push(`rotate(${rotate}deg)`);
  if (scale !== 1) parts.push(`scale(${scale})`);
  if (parts.length) {
    // The edit goes FIRST so the layout's own entrance motion still plays,
    // just from the element's new place.
    out.transform = [parts.join(' '), style.transform].filter(Boolean).join(' ');
    if (opts.inline && (!style.display || style.display === 'inline')) out.display = 'inline-block';
    // Nudge the edited element above its neighbours so a moved heading is
    // never hidden under the card body it was dragged across.
    if (out.position === undefined || out.position === 'static') out.position = 'relative';
    if (out.zIndex === undefined) out.zIndex = 2;
  }

  if (e.opacity !== undefined) {
    const base = typeof style.opacity === 'number' ? style.opacity : 1;
    out.opacity = base * clampNum(e.opacity, 0.05, 1, 1);
  }
  if (typeof e.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(e.color)) out.color = e.color;
  if (e.weight !== undefined) out.fontWeight = Math.round(clampNum(e.weight, 100, 900, 400) / 100) * 100;
  if (e.italic !== undefined) out.fontStyle = e.italic ? 'italic' : 'normal';
  if (e.underline !== undefined) out.textDecoration = e.underline ? 'underline' : 'none';
  if (e.case && CASES[e.case]) out.textTransform = CASES[e.case];
  if (e.align === 'left' || e.align === 'center' || e.align === 'right') out.textAlign = e.align;
  if (e.tracking !== undefined) out.letterSpacing = `${clampNum(e.tracking, -0.1, 0.5, 0)}em`;

  return out;
};

export type EditFn = ((id: string, style?: React.CSSProperties, opts?: EditOptions) => EditProps) & {
  /** The element's replacement wording, or the layout's own. */
  text: (id: string, fallback: string) => string;
  /** Whether the element was removed — for layouts that must skip it outright. */
  hidden: (id: string) => boolean;
  /** The raw edit, for layouts whose own logic must yield to it. */
  get: (id: string) => ElementEdit | undefined;
};

export const useEdit = (): EditFn => {
  const { sceneId, edits } = useContext(EditsContext);
  const ghost = useIsGhost();
  const { width, height } = useVideoConfig();

  return useMemo(() => {
    const fn = ((id: string, style: React.CSSProperties = {}, opts: EditOptions = {}): EditProps => {
      const e = edits[id];
      const props: EditProps = { style: e ? applyEdit(style, e, width, height, opts) : style };
      // Motion-blur duplicates draw the same element again at an offset; only
      // the real one is clickable.
      if (sceneId && !ghost) {
        props['data-edit-id'] = id;
        props['data-edit-scene'] = sceneId;
        props['data-edit-kind'] = opts.kind ?? 'text';
      }
      return props;
    }) as EditFn;
    fn.text = (id, fallback) => {
      const t = edits[id]?.text;
      return typeof t === 'string' && t.trim() !== '' ? t : fallback;
    };
    fn.hidden = (id) => Boolean(edits[id]?.hidden);
    fn.get = (id) => edits[id];
    return fn;
  }, [sceneId, edits, ghost, width, height]);
};
