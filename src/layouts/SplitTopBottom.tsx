import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Scene } from '../types';
import { SlotRenderer } from '../components/SlotRenderer';
import { useTheme } from '../theme';

const Row: React.FC<{ grow?: number; children: React.ReactNode }> = ({ grow = 1, children }) => (
  <div style={{ flex: `${grow} 1 0%`, width: '100%', minHeight: 0, overflow: 'hidden', borderRadius: 6 }}>{children}</div>
);

/**
 * split_top_bottom: two stacked rows (slot_top / slot_bottom) over ambient —
 * equal by default; a validator-set emphasis_pct (sparse text beside media,
 * copilot.md §7.3) hands the media row the larger share of the height.
 */
export const SplitTopBottom: React.FC<{ scene: Scene }> = ({ scene }) => {
  const theme = useTheme();
  const top = scene.slots['slot_top'];
  const bottom = scene.slots['slot_bottom'];
  const topPct =
    top?.emphasis_pct ?? (bottom?.emphasis_pct !== undefined ? 100 - bottom.emphasis_pct : 50);

  return (
    <AbsoluteFill style={{ flexDirection: 'column', gap: 18, padding: '4%' }}>
      <Row grow={topPct}>
        <SlotRenderer slot={top} />
      </Row>
      <div
        style={{
          height: 4,
          width: '100%',
          background: theme.accent,
        }}
      />
      <Row grow={100 - topPct}>
        <SlotRenderer slot={bottom} />
      </Row>
    </AbsoluteFill>
  );
};
