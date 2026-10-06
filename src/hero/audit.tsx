import React, { useLayoutEffect, useRef } from 'react';
import { continueRender, delayRender } from 'remotion';

/**
 * Layout audit for a hero's acceptance test — the checks a vision model is
 * bad and expensive at, done exactly by measuring the DOM.
 *
 * On the hero bench (2026-10-03) a gpt-4o-mini reviewer passed headlines
 * clipped by the frame edge and 14px labels, and raising its image detail to
 * see them made each review cost more than writing the scene. The browser
 * already knows where every glyph is: this walks the hero's text nodes after
 * layout and reports, through the console the render service captures as
 * hero errors, text that
 *
 *   - runs off a frame edge                              ("off-frame", hard)
 *   - is smaller than ~24px at 1080p                     ("small", soft)
 *   - overlaps other visible text                        ("overlap", soft)
 *
 * Only text that is visibly on screen (effective opacity ≥ 0.5) is judged, so
 * a caption mid-crossfade is not an overlap. Mounted ONLY when the scene's
 * hero carries `audit: true` (HeroSceneService's test renders) — never in a
 * real render. This is trusted renderer code; the model's code never sees it.
 */

interface TextBox {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const effectiveOpacity = (el: Element | null, root: Element): number => {
  let o = 1;
  for (let n: Element | null = el; n && n !== root.parentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    o *= parseFloat(s.opacity || '1');
    if (s.visibility === 'hidden' || s.display === 'none') return 0;
  }
  return o;
};

const clip = (s: string): string => (s.length > 40 ? `${s.slice(0, 38)}…` : s);

export const auditHeroText = (root: HTMLElement, unit: number): string[] => {
  const frame = root.getBoundingClientRect();
  if (frame.width < 10 || frame.height < 10) return [];
  const issues: string[] = [];
  const boxes: TextBox[] = [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text.length < 2) continue;
    const parent = node.parentElement;
    if (!parent || effectiveOpacity(parent, root) < 0.5) continue;

    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;

    const box = { text, left: r.left - frame.left, top: r.top - frame.top, right: r.right - frame.left, bottom: r.bottom - frame.top };
    boxes.push(box);

    const edges: string[] = [];
    if (box.left < -2) edges.push('left');
    if (box.right > frame.width + 2) edges.push('right');
    if (box.top < -2) edges.push('top');
    if (box.bottom > frame.height + 2) edges.push('bottom');
    if (edges.length) issues.push(`off-frame: the text "${clip(text)}" runs off the ${edges.join(' and ')} edge`);

    // A line box is ~1.2× the font size; the smallest line in the node is its true size.
    const lines = Array.from(range.getClientRects()).filter((x) => x.width > 1 && x.height > 1);
    const lineH = lines.length ? Math.min(...lines.map((x) => x.height)) : r.height;
    const px = lineH / 1.2;
    if (px < 22 * unit) issues.push(`small: the text "${clip(text)}" is about ${Math.round(px / unit)}×u tall — make it at least 26×u`);
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w <= 0 || h <= 0) continue;
      const smaller = Math.min((a.right - a.left) * (a.bottom - a.top), (b.right - b.left) * (b.bottom - b.top));
      if (smaller > 0 && (w * h) / smaller > 0.25) {
        issues.push(`overlap: the text "${clip(a.text)}" overlaps "${clip(b.text)}"`);
      }
    }
  }

  return [...new Set(issues)].slice(0, 8);
};

/** Wraps a hero in a test render; reports its layout once per frame. */
export const HeroAudit: React.FC<{ unit: number; children: React.ReactNode }> = ({ unit, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  // Measuring at commit is useless here: Remotion has not sized the
  // composition yet (the frame reads 0×0 — the same mount-measure gotcha as
  // labeled_diagram), and the video's fonts may still be loading. So the
  // audit holds the frame (delayRender) until the box has a size AND
  // document.fonts is ready, measures once, then lets the frame through.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = delayRender('hero layout audit', { timeoutInMilliseconds: 15000 });
    let done = false;
    let fontsReady = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(safety);
      continueRender(handle);
    };
    const run = (): void => {
      if (done || !fontsReady || el.getBoundingClientRect().width < 10) return;
      for (const issue of auditHeroText(el, unit)) {
        console.warn(`[hero] audit: ${issue}`);
      }
      finish();
    };
    const observer = new ResizeObserver(run);
    observer.observe(el);
    const safety = setTimeout(finish, 6000);
    (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready
      .then(() => {
        fontsReady = true;
        requestAnimationFrame(run);
      })
      .catch(() => finish());
    return finish;
  });
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      {children}
    </div>
  );
};
