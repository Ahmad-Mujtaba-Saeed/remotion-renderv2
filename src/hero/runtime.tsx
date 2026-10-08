import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Freeze,
  Sequence,
  Video,
  useCurrentFrame,
  getRemotionEnvironment,
  useVideoConfig,
  interpolate,
  interpolateColors,
  measureSpring,
  random,
  spring,
} from 'remotion';
import { Scene } from '../types';
import { SceneClockProvider, useSceneWindow } from '../canvas/SceneClock';
import * as Kit from './kit';
import { HeroAudit } from './audit';
import { HERO_TAGS, createLoopBudget, heroSafeKey, sanitizeHeroProps } from './policy';

/**
 * Hero scene runtime — loads the JS that guard.ts compiled from a model's TSX
 * and mounts it as the scene, with the scene's own card as the fallback.
 *
 * The module is evaluated with exactly five names in scope: `exports`,
 * `require` (resolving only the three shims below), `__h`/`__F` (the JSX
 * factory and fragment) and `__k` (the computed-key check guard.ts routes
 * every `a[b]` through). See policy.ts for the threat model.
 */

/** The JSX factory every hero element goes through: allowlisted tags, scrubbed props. */
const safeH = (type: unknown, props: Record<string, unknown> | null, ...children: React.ReactNode[]): React.ReactElement | null => {
  if (typeof type === 'string') {
    if (!HERO_TAGS.has(type)) return null;
  } else if (!(typeof type === 'function' || type === React.Fragment || (type !== null && typeof type === 'object'))) {
    return null;
  }
  return React.createElement(type as React.ElementType, sanitizeHeroProps(props), ...children);
};

// ---- the three modules a hero may import -----------------------------------

const reactShim = {
  default: { Fragment: React.Fragment, useMemo: React.useMemo },
  Fragment: React.Fragment,
  useMemo: React.useMemo,
};

const remotionShim = {
  AbsoluteFill,
  Sequence,
  // The SCENE's clock, in every composition mode (canvas takeovers included).
  useCurrentFrame: Kit.useHeroFrame,
  useVideoConfig: Kit.useHeroConfig,
  interpolate,
  interpolateColors,
  spring,
  measureSpring,
  Easing,
  random,
};

const kitShim = {
  useHero: Kit.useHero,
  useCue: Kit.useCue,
  cue: Kit.cue,
  spring,
  interpolate,
  interpolateColors,
  Easing,
  progress: Kit.progress,
  pop: Kit.pop,
  stagger: Kit.stagger,
  ease: Kit.ease,
  noise1: Kit.noise1,
  noise2: Kit.noise2,
  mix: Kit.mix,
  FitText: Kit.FitText,
  DrawPath: Kit.DrawPath,
  Counter: Kit.Counter,
  Asset: Kit.Asset,
  Depth: Kit.Depth,
  Layer: Kit.Layer,
};

const MODULES: Record<string, unknown> = { remotion: remotionShim, react: reactShim, 'hero-kit': kitShim };

/**
 * The `Array` a scene sees: the real one, except that it refuses to MAKE an
 * absurdly long array (`Array.from({ length: 1e9 })`, `new Array(1e9)`) —
 * the allocation bomb the per-frame tick budget cannot see, because no scene
 * code runs while the engine fills it. Literals, methods and isArray behave
 * exactly as normal.
 */
const HERO_MAX_ARRAY = 200_000;
const tooLong = (n: unknown): boolean => typeof n === 'number' && n > HERO_MAX_ARRAY;
const SafeArray = function (this: unknown, ...args: unknown[]) {
  if (args.length === 1 && tooLong(args[0])) throw new Error(`hero: arrays are limited to ${HERO_MAX_ARRAY} items`);
  return (Array as unknown as (...a: unknown[]) => unknown[])(...args);
} as unknown as ArrayConstructor;
Object.assign(SafeArray, {
  isArray: Array.isArray,
  of: Array.of,
  from: (src: unknown, ...rest: unknown[]) => {
    const len = src && typeof src === 'object' ? (src as { length?: unknown }).length : undefined;
    if (tooLong(len)) throw new Error(`hero: arrays are limited to ${HERO_MAX_ARRAY} items`);
    return (Array.from as (...a: unknown[]) => unknown[])(src, ...rest);
  },
});

// ---- content security policy -----------------------------------------------

let assetOrigins: string[] = [];
let cspInstalled = false;

/** The origins this video's own assets load from (set once per composition). */
export const registerHeroAssetOrigins = (shotList: unknown): void => {
  const found = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      const m = /^(https?:\/\/[^/\s"']+)/i.exec(v);
      if (m) found.add(m[1].toLowerCase());
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  };
  walk(shotList);
  assetOrigins = [...found];
};

/**
 * Install the render page's CSP before the first hero is evaluated: nothing
 * may connect anywhere but the bundle's own server, no frames, workers,
 * objects or form posts, and pictures/media only from this video's asset
 * origins. A CSP cannot be lifted once set, so hero code cannot undo it.
 */
const ensureHeroCsp = (): void => {
  if (cspInstalled || typeof document === 'undefined') return;
  const media = ["'self'", 'data:', 'blob:', ...assetOrigins].join(' ');
  const policy = [
    "default-src 'self' data: blob:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${media}`,
    `media-src ${media}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = policy;
  document.head.prepend(meta);
  cspInstalled = true;
};

// ---- loading ---------------------------------------------------------------

const cache = new Map<string, React.ComponentType | Error>();

/** One budget for the page: each render of a hero resets it (see guard.ts). */
const loopBudget = createLoopBudget();

export const loadHero = (js: string): React.ComponentType | Error => {
  const hit = cache.get(js);
  if (hit) return hit;

  let result: React.ComponentType | Error;
  try {
    ensureHeroCsp();
    const exportsObj: Record<string, unknown> = {};
    const requireShim = (name: string): unknown => {
      if (!(name in MODULES)) throw new Error(`hero: module "${name}" is not available`);
      return MODULES[name];
    };
    // eslint-disable-next-line no-new-func
    const factory = new Function('exports', 'require', '__h', '__F', '__k', '__L', 'Array', `"use strict";\n${js}`);
    factory(exportsObj, requireShim, safeH, React.Fragment, heroSafeKey, loopBudget.tick, SafeArray);
    const comp = exportsObj.default;
    result = typeof comp === 'function' ? (comp as React.ComponentType) : new Error('hero: the module has no default export');
  } catch (e) {
    result = e instanceof Error ? e : new Error(String(e));
  }
  if (result instanceof Error) console.warn('[hero] load failed:', result.message);
  cache.set(js, result);
  return result;
};

class HeroBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.warn('[hero] runtime error:', error instanceof Error ? error.message : String(error));
  }

  render(): React.ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Shown on the Player only: hero code never runs in the dashboard (see policy.ts). */
const HeroBadge: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      top: 18,
      right: 18,
      padding: '6px 12px',
      borderRadius: 999,
      background: 'rgba(0,0,0,0.55)',
      color: '#fff',
      font: '600 14px system-ui, sans-serif',
      letterSpacing: 0.2,
    }}
  >
    AI motion scene · plays in the export
  </div>
);

/**
 * The hero as the Player sees it: the server-rendered clip (POST /hero/clip),
 * a plain video file. Past the clip's end (the voice came out a little longer
 * than the scene it was made for) it holds the last frame instead of going
 * blank.
 */
const HeroClip: React.FC<{ src: string; frames: number }> = ({ src, frames }) => {
  const frame = useCurrentFrame();
  const last = Math.max(0, frames - 1);
  const video = <Video src={src} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {frames > 0 && frame >= last ? <Freeze frame={last}>{video}</Freeze> : video}
    </AbsoluteFill>
  );
};

/**
 * A hero scene. `fallback` is the scene's own card: it replaces the hero if
 * its code fails to load or throws, and it is what the Player shows when the
 * hero has no preview clip yet.
 */
export const HeroScene: React.FC<{ scene: Scene; fallback: React.ReactNode }> = ({ scene, fallback }) => {
  const env = getRemotionEnvironment();
  const win = useSceneWindow();
  const { width, height } = useVideoConfig();
  const hero = scene.hero;

  if (!hero?.js) return <>{fallback}</>;

  let body: React.ReactNode;
  if (!env.isRendering) {
    // Hero code never runs in the dashboard: play its recorded clip instead.
    if (!hero.preview_url) {
      return (
        <>
          {fallback}
          <HeroBadge />
        </>
      );
    }
    body = <HeroClip src={hero.preview_url} frames={hero.preview_frames ?? 0} />;
  } else {
    const Comp = loadHero(hero.js);
    if (Comp instanceof Error) return <>{fallback}</>;
    // A fresh loop budget for this frame's render of the scene.
    loopBudget.reset();
    body = renderHeroBody(Comp, hero, scene, width, height, fallback);
  }

  // Canvas takeovers live on the GLOBAL clock. Re-base onto the scene so a
  // <Sequence from={30}> inside the hero means 30 frames into the scene, in
  // every mode — and hand the kit a window that starts at 0 to match.
  if (win && win.start !== 0) {
    return (
      <Sequence from={win.start} layout="none">
        <SceneClockProvider
          window={{
            start: 0,
            end: win.end - win.start,
            narrationStart: (win.narrationStart ?? win.start) - win.start,
          }}
        >
          {body}
        </SceneClockProvider>
      </Sequence>
    );
  }
  return body;
};

const renderHeroBody = (
  Comp: React.ComponentType,
  hero: NonNullable<Scene['hero']>,
  scene: Scene,
  width: number,
  height: number,
  fallback: React.ReactNode,
): React.ReactNode => {
  return (
    <HeroBoundary fallback={fallback}>
      <Kit.HeroEnvProvider
        env={{ words: scene.narration_words ?? [], assets: hero.assets ?? {}, captions: hero.captions === true }}
      >
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          {hero.audit ? (
            <HeroAudit unit={Math.min(width, height) / 1080}>
              <Comp />
            </HeroAudit>
          ) : (
            <Comp />
          )}
        </AbsoluteFill>
      </Kit.HeroEnvProvider>
    </HeroBoundary>
  );
};
