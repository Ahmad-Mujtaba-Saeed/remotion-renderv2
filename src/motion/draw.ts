/**
 * Geometry for DRAWN connectors and the write-cursor ("nib") that rides their
 * frontier as they grow. Shared by the flowchart-family cards (hierarchy_card,
 * decision_tree) so the pen tip the eye follows is one implementation. Pure
 * math — no hooks, deterministic per frame.
 */

/** SVG path string ("M x y L x y …") from a polyline's points. */
export const edgePath = (pts: [number, number][]): string =>
  'M ' + pts.map((p) => `${p[0]} ${p[1]}`).join(' L ');

/** The point a fraction t (0..1) along a polyline, walked by cumulative length. */
export const pointAlong = (pts: [number, number][], t: number): [number, number] => {
  const tt = Math.max(0, Math.min(1, t));
  const segs = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]));
  const total = segs.reduce((a, b) => a + b, 0);
  let d = tt * total;
  for (let k = 0; k < segs.length; k++) {
    if (d <= segs[k] || k === segs.length - 1) {
      const f = segs[k] ? d / segs[k] : 0;
      return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f];
    }
    d -= segs[k];
  }
  return pts[pts.length - 1];
};
