import { CanvasItem, CanvasPlan, Scene } from '../types';

/**
 * Deterministic fallback layout — a TS mirror of PHP CanvasPlanValidator's
 * zigzag placement, used when a shot list arrives without a canvas plan (old
 * projects) or when the plan doesn't cover every scene. Guarantees the
 * journey renders no matter what Laravel sent.
 */

const seeded = (i: number, salt: number): number => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const baseCardFor = (aspectRatio?: string): { w: number; h: number } => {
  if (aspectRatio === '9:16') return { w: 1000, h: 1560 };
  if (aspectRatio === '1:1') return { w: 1240, h: 1240 };
  return { w: 1560, h: 1000 };
};

const overlaps = (a: CanvasItem, b: CanvasItem, gap: number): boolean =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;

const autoItem = (sceneId: string, i: number, placed: CanvasItem[], base: { w: number; h: number }): CanvasItem => {
  const { w, h } = base;
  const jx = seeded(i, 1) * 0.12 - 0.06;
  const jy = seeded(i, 2) * 0.12 - 0.06;
  const swing = i % 2 === 0 ? -0.55 : 0.55;

  const item: CanvasItem = {
    scene_id: sceneId,
    x: i * w * 1.45 + jx * w,
    y: swing * h + jy * h,
    w,
    h,
    rotation: (seeded(i, 3) * 2 - 1) * 2.5,
    emphasis: i === 0 ? 'hero' : 'normal',
    hold_move: (['breathe', 'push_in', 'drift'] as const)[i % 3],
  };

  for (const other of placed) {
    while (overlaps(item, other, 160)) {
      item.x += w * 0.35;
      item.y += h * 0.2;
    }
  }

  return item;
};

/** Shift all items into positive space and size the world around them. */
const fitWorld = (items: CanvasItem[]): CanvasPlan['world'] => {
  if (!items.length) return { width: 4000, height: 3000 };

  const minX = Math.min(...items.map((i) => i.x - i.w / 2));
  const maxX = Math.max(...items.map((i) => i.x + i.w / 2));
  const minY = Math.min(...items.map((i) => i.y - i.h / 2));
  const maxY = Math.max(...items.map((i) => i.y + i.h / 2));

  const margin = 900;
  for (const item of items) {
    item.x = item.x - minX + margin;
    item.y = item.y - minY + margin;
  }

  return { width: Math.ceil(maxX - minX + 2 * margin), height: Math.ceil(maxY - minY + 2 * margin) };
};

/**
 * Produce a plan that covers EVERY scene, in order. A valid incoming plan is
 * used as-is; a missing/partial one is (re)built deterministically.
 */
export const normalizePlan = (
  plan: CanvasPlan | null | undefined,
  scenes: Scene[],
  aspectRatio?: string
): CanvasPlan => {
  const base = baseCardFor(aspectRatio);
  const byScene = new Map<string, CanvasItem>();
  for (const item of plan?.items ?? []) {
    if (item && item.scene_id && !byScene.has(item.scene_id)) {
      byScene.set(item.scene_id, { ...item });
    }
  }

  const covered = scenes.filter((s) => byScene.has(s.scene_id)).length;
  const usePlan = plan && covered >= Math.ceil(scenes.length / 2);

  const items: CanvasItem[] = [];
  scenes.forEach((scene, i) => {
    const existing = usePlan ? byScene.get(scene.scene_id) : undefined;
    items.push(existing ?? autoItem(scene.scene_id, i, items, base));
  });

  const world = usePlan && plan?.world?.width ? plan.world : fitWorld(items);

  // The journey is a chain in scene order; keep any director labels/styles.
  const labelByPair = new Map<string, { style?: 'curve' | 'straight'; label?: string }>();
  for (const conn of plan?.connectors ?? []) {
    labelByPair.set(`${conn.from}->${conn.to}`, { style: conn.style, label: conn.label });
  }

  const connectors = scenes.slice(0, -1).map((scene, i) => {
    const meta = labelByPair.get(`${scene.scene_id}->${scenes[i + 1].scene_id}`);
    return {
      from: scene.scene_id,
      to: scenes[i + 1].scene_id,
      style: meta?.style ?? ('curve' as const),
      label: meta?.label ?? '',
    };
  });

  return {
    version: plan?.version ?? 1,
    journey_pattern: plan?.journey_pattern ?? 'zigzag',
    world,
    items,
    connectors,
  };
};
