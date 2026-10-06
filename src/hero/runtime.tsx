import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Sequence,
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
};

const MODULES: Record<string, unknown> = { remotion: remotionShim, react: reactShim, 'hero-kit': kitShim };

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
    const factory = new Function('exports', 'require', '__h', '__F', '__k', '__L', `"use strict";\n${js}`);
    factory(exportsObj, requireShim, safeH, React.Fragment, heroSafeKey, loopBudget.tick);
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
 * A hero scene. `fallback` is the scene's own card: it plays in the Player,
 * and replaces the hero if its code fails to load or throws.
 */
export const HeroScene: React.FC<{ scene: Scene; fallback: React.ReactNode }> = ({ scene, fallback }) => {
  const env = getRemotionEnvironment();
  const win = useSceneWindow();
  const { width, height } = useVideoConfig();
  const hero = scene.hero;

  if (!hero?.js) return <>{fallback}</>;
  if (!env.isRendering) {
    return (
      <>
        {fallback}
        <HeroBadge />
      </>
    );
  }

  const Comp = loadHero(hero.js);
  if (Comp instanceof Error) return <>{fallback}</>;
  // A fresh loop budget for this frame's render of the scene.
  loopBudget.reset();

  const body = (
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
