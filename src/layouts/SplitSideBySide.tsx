import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Scene } from '../types';
import { SlotRenderer } from '../components/SlotRenderer';
import { useTheme } from '../theme';
import { useIsPortrait } from '../responsive';

const Half: React.FC<{ grow?: number; children: React.ReactNode }> = ({ grow = 1, children }) => (
  <div style={{ flex: `${grow} 1 0%`, minWidth: 0, minHeight: 0, overflow: 'hidden', borderRadius: 6 }}>{children}</div>
);

/**
 * split_side_by_side: two columns (slot_left | slot_right) over ambient —
 * equal by default; when the validator marks one slot's emphasis_pct
 * (sparse text beside media, copilot.md §7.3) the media side takes that
 * share so the frame never sits mostly empty. In a 9:16 portrait frame two
 * columns would be unusably thin, so the split stacks vertically instead.
 */
export const SplitSideBySide: React.FC<{ scene: Scene }> = ({ scene }) => {
  const theme = useTheme();
  const portrait = useIsPortrait();
  const left = scene.slots['slot_left'];
  const right = scene.slots['slot_right'];
  const leftPct =
    left?.emphasis_pct ?? (right?.emphasis_pct !== undefined ? 100 - right.emphasis_pct : 50);

  return (
    <AbsoluteFill
      style={{
        flexDirection: portrait ? 'column' : 'row',
        gap: 20,
        padding: '4%',
        alignItems: 'stretch',
      }}
    >
      <Half grow={leftPct}>
        <SlotRenderer slot={left} />
      </Half>
      <div
        style={{
          width: portrait ? undefined : 4,
          height: portrait ? 4 : undefined,
          alignSelf: 'stretch',
          background: theme.accent,
        }}
      />
      <Half grow={100 - leftPct}>
        <SlotRenderer slot={right} />
      </Half>
    </AbsoluteFill>
  );
};
