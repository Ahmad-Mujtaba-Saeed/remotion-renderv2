/**
 * Hero scene POLICY — what model-written scene code may touch.
 *
 * A hero scene is a React component a code model wrote for ONE beat of one
 * video (Laravel HeroSceneService). It is untrusted code. It runs inside the
 * headless Chromium that renders the video, and that page can reach the
 * render service itself (assets are served from :3020, whose /render writes
 * files on the host), so "it is only an animation" is not a security model.
 *
 * Four layers, each enough to stop the obvious attacks on its own:
 *
 *  1. guard.ts (Node, at compile time): the source is parsed and REJECTED if
 *     it names a global that can reach the network, the DOM, timers or code
 *     generation, a property that walks to them (`constructor`,
 *     `ownerDocument`…), an import outside the three allowed modules, a JSX
 *     element outside the allowlist, a ref or event handler, or a string that
 *     points anywhere (`url(http…)`, `javascript:`). It also rewrites every
 *     computed key through a runtime check and bounds every loop.
 *  2. runtime.tsx (browser): the module only ever receives SHIMS — a JSX
 *     factory that re-checks every element and prop, a React with no
 *     createElement escape, a remotion subset and the kit.
 *  3. A Content-Security-Policy is installed in the render page before any
 *     hero code is evaluated: no connections, no frames, no forms, images and
 *     media only from the origins this video's own assets use.
 *  4. Hero code never runs in the dashboard (the Player shows the scene's
 *     normal card) — the dashboard origin holds the user's session.
 *
 * This file is shared by both sides, so the two lists can never disagree.
 */

/** Modules a hero may import, and what it may take from each. */
export const HERO_MODULES: Record<string, string[]> = {
  remotion: [
    'AbsoluteFill',
    'Sequence',
    'useCurrentFrame',
    'useVideoConfig',
    'interpolate',
    'interpolateColors',
    'spring',
    'measureSpring',
    'Easing',
    'random',
  ],
  react: ['default', 'Fragment', 'useMemo'],
  'hero-kit': [
    'useHero',
    'useCue',
    'cue',
    // Also re-exported from the kit: models reach for them there.
    'spring',
    'interpolate',
    'interpolateColors',
    'Easing',
    'progress',
    'pop',
    'stagger',
    'ease',
    'noise1',
    'noise2',
    'mix',
    'FitText',
    'DrawPath',
    'Counter',
    'Asset',
  ],
};

/** The only intrinsic elements a hero may create. No media, links, frames, scripts, styles or foreign objects. */
export const HERO_TAGS = new Set<string>([
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'b', 'i', 'small', 'sup', 'sub', 'br',
  'ul', 'ol', 'li',
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan',
  'defs', 'linearGradient', 'radialGradient', 'stop', 'mask', 'clipPath', 'pattern', 'marker',
  'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feComposite', 'feMerge',
  'feMergeNode', 'feFlood', 'feMorphology', 'feTurbulence', 'feDisplacementMap', 'feDropShadow',
]);

/**
 * Globals a hero may not name at all — the network, the DOM, timers, storage,
 * code generation, reflection, wall-clock time and non-determinism.
 */
export const HERO_BANNED_IDENTIFIERS = new Set<string>([
  'window', 'self', 'globalThis', 'global', 'document', 'top', 'parent', 'frames', 'opener',
  'location', 'navigator', 'history', 'screen', 'origin',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'ServiceWorker',
  'importScripts', 'BroadcastChannel', 'MessageChannel', 'postMessage', 'RTCPeerConnection',
  'eval', 'Function', 'AsyncFunction', 'GeneratorFunction',
  'setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame', 'requestIdleCallback', 'queueMicrotask',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore', 'crypto',
  'Reflect', 'Proxy', 'process', 'require', 'module', 'exports', 'Buffer',
  'Image', 'Audio', 'Option', 'FontFace', 'FileReader', 'Blob', 'URL', 'Request', 'Response', 'Headers',
  'Date', 'performance', 'Promise', 'WeakRef', 'FinalizationRegistry', 'Atomics', 'SharedArrayBuffer', 'WebAssembly',
  'alert', 'confirm', 'prompt', 'open', 'close', 'print', 'Notification', 'customElements', 'trustedTypes',
]);

/** Property names a hero may not read or write — each one walks somewhere it must not go. */
export const HERO_BANNED_MEMBERS = new Set<string>([
  'constructor', '__proto__', 'prototype',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
  'getPrototypeOf', 'setPrototypeOf', 'defineProperty', 'defineProperties',
  'getOwnPropertyDescriptor', 'getOwnPropertyDescriptors',
  'ownerDocument', 'defaultView', 'contentWindow', 'contentDocument', 'getRootNode', 'view',
  'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'srcdoc', 'cookie', 'domain', 'sendBeacon',
  'caller', 'callee', 'createElement', 'cloneElement', 'createPortal',
]);

/** Props no element may carry: refs and handlers hand out DOM nodes; the rest load or inject. */
export const isBannedProp = (name: string): boolean =>
  /^on[A-Z]/.test(name) ||
  name === 'ref' ||
  name === 'dangerouslySetInnerHTML' ||
  name === 'srcDoc' ||
  name === 'srcdoc' ||
  name === 'href' ||
  name === 'xlinkHref' ||
  name === 'xlink:href' ||
  name === 'src' ||
  name === 'srcSet' ||
  name === 'action' ||
  name === 'formAction' ||
  name === 'poster' ||
  name === 'data';

/**
 * A string that points somewhere: an external url() (an SVG `url(#id)`
 * reference is the one allowed form), a scheme, or a CSS import.
 */
export const isUnsafeString = (value: string): boolean => {
  const v = value.toLowerCase();
  if (v.includes('javascript:') || v.includes('@import') || v.includes('expression(')) return true;
  if (/(https?:)?\/\/[a-z0-9]/.test(v)) return true;
  if (/data:\s*text\/html/.test(v)) return true;
  // Every url( … ) — terminated or not — must target a fragment (#id).
  const re = /url\(\s*['"]?\s*([^'")\s]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v)) !== null) {
    if (!m[1].startsWith('#')) return true;
  }
  // Same for image-set(), the other CSS function that loads.
  return v.includes('image-set(');
};

/** The runtime half of the computed-key rule: every `a[b]` in a hero goes through this. */
export const heroSafeKey = (key: unknown): unknown => {
  if (typeof key === 'string' && HERO_BANNED_MEMBERS.has(key)) {
    throw new Error(`hero: key "${key}" is not allowed`);
  }
  return key;
};

const sanitizeStyle = (style: unknown): Record<string, unknown> | undefined => {
  if (!style || typeof style !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style as Record<string, unknown>)) {
    if (typeof v === 'string' && isUnsafeString(v)) continue;
    out[k] = v;
  }
  return out;
};

/**
 * The runtime half of the prop rules — applied by the JSX factory to EVERY
 * element, so props assembled at runtime (spreads, computed keys) are held to
 * the same rules the guard applies to the literal source.
 */
export const sanitizeHeroProps = (props: Record<string, unknown> | null | undefined): Record<string, unknown> | null => {
  if (!props) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children') {
      out[k] = v;
      continue;
    }
    if (isBannedProp(k)) continue;
    if (k === 'style') {
      out.style = sanitizeStyle(v);
      continue;
    }
    if (typeof v === 'string' && isUnsafeString(v)) continue;
    out[k] = v;
  }
  return out;
};

/** Loop iterations ALL loops in a scene may run per frame before the scene is abandoned. */
export const HERO_LOOP_BUDGET = 5_000_000;

/** The per-frame loop budget (guard.ts makes every loop body call `tick`). */
export const createLoopBudget = (): { tick: () => void; reset: () => void } => {
  let used = 0;
  return {
    tick: () => {
      if (++used > HERO_LOOP_BUDGET) throw new Error('hero: loop budget exceeded');
    },
    reset: () => {
      used = 0;
    },
  };
};

/** Hard size limits on what a model may hand us. */
export const HERO_MAX_SOURCE_CHARS = 60000;
