import React from 'react';
import { clamp01, easeOutExpo } from './easing';

/**
 * Number count-up (copilot.md §4.3). Any numeric token in a heading or stat
 * rolls up to its value as it lands — the classic data-doc move. Layout never
 * shifts because the digits render with `fontVariantNumeric: tabular-nums`
 * (every digit the same advance width).
 *
 * `parseCountable` recognises `\d[\d,\.]*` inside a token, keeping any prefix
 * ("$") and suffix ("%", "B", "x") fixed while only the numeric core rolls.
 * Values < 2 don't roll (watching "1" count up is noise, not drama).
 */

export interface CountableToken {
  prefix: string;
  core: string;
  suffix: string;
  value: number;
  decimals: number;
  grouped: boolean;
}

/** Roll duration, frames @30fps. */
export const ROLL_F = 24;

export const parseCountable = (token: string): CountableToken | null => {
  const m = /^([^\d]*)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(token);
  if (!m) return null;
  const core = m[2];
  const value = parseFloat(core.replace(/,/g, ''));
  if (!Number.isFinite(value) || value < 2) return null;
  const decimals = core.includes('.') ? core.split('.')[1].length : 0;
  return { prefix: m[1], core, suffix: m[3], value, decimals, grouped: core.includes(',') };
};

/** Format a mid-roll value in the token's own notation (grouping, decimals). */
const formatAs = (v: number, token: CountableToken): string => {
  const fixed = v.toFixed(token.decimals);
  if (!token.grouped) return fixed;
  const [int, frac] = fixed.split('.');
  const groupedInt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac !== undefined ? `${groupedInt}.${frac}` : groupedInt;
};

/**
 * The rolled display string for a countable token at a local frame. Big
 * numbers start at 65% of their value (rolling a 4-digit figure from zero
 * spends most of the move on meaningless digits); small ones earn the full
 * ride from 0. easeOutExpo: the roll sprints, then settles on the real value.
 */
export const rollText = (token: CountableToken, frame: number, fps: number): string => {
  const dur = Math.max(1, Math.round((ROLL_F * fps) / 30));
  const p = easeOutExpo(clamp01(frame / dur));
  const from = token.value >= 100 ? token.value * 0.65 : 0;
  const v = from + (token.value - from) * p;
  return `${token.prefix}${formatAs(p >= 1 ? token.value : v, token)}${token.suffix}`;
};

/** Inline rolled number; renders the token verbatim when it isn't countable. */
export const CountUp: React.FC<{
  token: string;
  /** Local frame since the token landed (0 = roll start). */
  frame: number;
  fps: number;
  style?: React.CSSProperties;
}> = ({ token, frame, fps, style }) => {
  const parsed = parseCountable(token);
  if (!parsed) return <span style={style}>{token}</span>;
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {rollText(parsed, frame, fps)}
    </span>
  );
};
